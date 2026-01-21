const WebSocket = require('ws');
const { SerialPort } = require('serialport');

// WebSocket-Server erstellen
const wss = new WebSocket.Server({ port: 8080 });
console.log('WebSocket-Server läuft auf ws://localhost:8080');

let tempBytes = [];

let isPortOpen = false;

function openPort() {
    port = new SerialPort({
        path: 'COM11',
        baudRate: 115200,
    });

    port.on('open', () => {
        tempBytes = [];
        isPortOpen = true;
        console.log('Serielle Schnittstelle geöffnet');
    });

    port.on('data', (data) => {
        const tempData = Buffer.from(data);
        for (const byte of tempData) {
            tempBytes.push(byte);
            if (tempBytes.length === 2 && (tempBytes[0] !== 0x55 || tempBytes[1] !== 0x61)) {
                tempBytes.shift();
                continue;
            }
            if (tempBytes.length === 20) {
                const decodedData = processData(tempBytes.slice(2));
                tempBytes = [];
                // Dekodierte Daten an alle WebSocket-Clients senden
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(decodedData));
                    }
                });
            }
        }
    });

    port.on('error', (err) => {
        tempBytes = [];
        console.error('Fehler:', err.message);
    });

    port.on('close', () => {
        tempBytes = [];
        isPortOpen = false;
        console.log('Serielle Schnittstelle geschlossen');
        retryOpenPort();
    });
}

function retryOpenPort() {
    let interval = setInterval(() => {
        if (!isPortOpen) {
            openPort();
        } else {
            clearInterval(interval);
            interval = null;
        }
    }, 1000); // Alle 1 Sekunde prüfen
}

// Datenanalyse
function processData(bytes) {
    const Ax = getSignInt16((bytes[1] << 8) | bytes[0]) / 32768 * 16;
    const Ay = getSignInt16((bytes[3] << 8) | bytes[2]) / 32768 * 16;
    const Az = getSignInt16((bytes[5] << 8) | bytes[4]) / 32768 * 16;
    const Gx = getSignInt16((bytes[7] << 8) | bytes[6]) / 32768 * 2000;
    const Gy = getSignInt16((bytes[9] << 8) | bytes[8]) / 32768 * 2000;
    const Gz = getSignInt16((bytes[11] << 8) | bytes[10]) / 32768 * 2000;
    const AngX = getSignInt16((bytes[13] << 8) | bytes[12]) / 32768 * 180;
    const AngY = getSignInt16((bytes[15] << 8) | bytes[14]) / 32768 * 180;
    const AngZ = getSignInt16((bytes[17] << 8) | bytes[16]) / 32768 * 180;

    return {
        Acceleration: { X: Ax, Y: Ay, Z: Az },
        Gyroscope: { X: Gx, Y: Gy, Z: Gz },
        Angle: { X: AngX, Y: AngY, Z: AngZ }
    };
}

// Hilfsfunktion zur Umwandlung von 16-Bit-Werten
function getSignInt16(value) {
    return value > 0x7FFF ? value - 0x10000 : value;
}

openPort();