"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WitMotionDeviceManagement = void 0;
const dm_utils_1 = require("@iobroker/dm-utils");
const i18n_1 = require("./i18n");
/** The adapter reads exactly one sensor, so there is exactly one device */
const SENSOR_ID = 'sensor';
const BAUD_RATES = [4800, 9600, 19200, 38400, 57600, 115200];
function svgIcon(path) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="${path}"/></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
const ICON_SENSOR = svgIcon('M6 4h12v1h3v2h-3v2h3v2h-3v2h3v2h-3v2h3v2h-3v1H6v-1H3v-2h3v-2H3v-2h3v-2H3V9h3V7H3V5h3zm5 11v3h1v-3zm2 0v3h1v-3zm2 0v3h1v-3z');
/** The wave states and their unit */
const WAVES = [
    { id: 'height', label: 'Significant wave height', unit: 'm' },
    { id: 'heightMax', label: 'Highest wave', unit: 'm' },
    { id: 'period', label: 'Mean wave period', unit: 's' },
    { id: 'periodPeak', label: 'Peak wave period', unit: 's' },
    { id: 'length', label: 'Wave length', unit: 'm' },
    { id: 'frequency', label: 'Wave frequency', unit: 'Hz' },
];
/** The measured channels: the config flag that enables them, their heading and unit */
const CHANNELS = [
    { channel: 'angle', flag: 'magnetometer', title: 'Magnetometer', unit: '°' },
    { channel: 'acceleration', flag: 'accelerometer', title: 'Acceleration', unit: 'g' },
    { channel: 'gyroscope', flag: 'gyroscope', title: 'Gyroscope', unit: '°/s' },
];
const AXES = [
    { axis: 'x', label: 'Roll (X)' },
    { axis: 'y', label: 'Pitch (Y)' },
    { axis: 'z', label: 'Yaw (Z)' },
];
class WitMotionDeviceManagement extends dm_utils_1.DeviceManagement {
    full(relId) {
        return `${this.adapter.namespace}.${relId}`;
    }
    isPortConfigured() {
        const config = this.adapter.config;
        return config.selectBy === 'device' ? !!config.serialPortDeviceId : !!config.serialPort;
    }
    /** The configured port as the user knows it: the port name or the USB device ID */
    getConfiguredPort() {
        const config = this.adapter.config;
        return (config.selectBy === 'device' ? config.serialPortDeviceId : config.serialPort) || '';
    }
    getInstanceInfo() {
        return {
            apiVersion: 'v3',
            identifierLabel: (0, i18n_1.t)('Serial port'),
        };
    }
    loadDevices(context) {
        context.setTotalDevices(1);
        context.addDevice(this.getSensorInfo());
    }
    getDeviceDetails(id) {
        if (id !== SENSOR_ID) {
            return Promise.resolve({ error: `Unknown device ${id}` });
        }
        return Promise.resolve(this.getSensorDetails());
    }
    // ---------------------------------------------------------------------------------------------
    // Card
    /**
     * One value of the card in a line of its own: the label on the left, the value on the right. Without
     * `labelIcon`: json-config draws it as a 28 px box on the baseline of the label, which then sits lower than
     * the value.
     */
    cardItem(relId, label, unit, digits) {
        return {
            type: 'state',
            oid: this.full(relId),
            foreign: true,
            label,
            unit,
            digits,
            size: 14,
            xs: 12,
        };
    }
    /**
     * The values on the card, one per line: the angles and the wave height. They are no indicators, as those
     * flow in one line with the connection and wrap wherever the width ends.
     */
    getCardValues() {
        const config = this.adapter.config;
        const items = {};
        if (config.magnetometer) {
            for (const { axis, label } of AXES) {
                items[`angle_${axis}`] = this.cardItem(`angle.${axis}`, (0, i18n_1.t)(label), '°', 1);
            }
        }
        if (config.waves) {
            items.waves_height = this.cardItem('waves.height', (0, i18n_1.t)('Wave height'), 'm', 2);
            items.waves_length = this.cardItem('waves.length', (0, i18n_1.t)('Wave length'), 'm', 1);
            items.waves_frequency = this.cardItem('waves.frequency', (0, i18n_1.t)('Wave frequency'), 'Hz', 2);
        }
        return Object.keys(items).length ? { id: SENSOR_ID, schema: { type: 'panel', items } } : undefined;
    }
    getSensorInfo() {
        const configured = this.isPortConfigured();
        const info = {
            id: SENSOR_ID,
            identifier: this.adapter.getOpenedPath() || this.getConfiguredPort() || '—',
            name: 'WitMotion WT901',
            icon: ICON_SENSOR,
            manufacturer: 'WitMotion',
            model: 'WT901BLECL',
            connectionType: 'other',
            status: {
                connection: {
                    stateId: this.full('info.connection'),
                    mapping: { true: 'connected', false: 'disconnected' },
                },
                warning: configured ? undefined : (0, i18n_1.t)('No serial port configured'),
            },
            customInfo: this.getCardValues(),
            hasDetails: true,
            actions: [
                {
                    id: 'edit',
                    icon: 'edit',
                    description: (0, i18n_1.t)('Connection settings'),
                    handler: (_id, context) => this.onEdit(context),
                },
            ],
        };
        if (configured) {
            info.actions.unshift({
                id: 'test',
                icon: 'play',
                description: (0, i18n_1.t)('Test connection'),
                handler: (_id, context) => this.onTest(context),
            });
        }
        return info;
    }
    // ---------------------------------------------------------------------------------------------
    // Details
    stateItem(relId, label, unit) {
        return {
            type: 'state',
            oid: this.full(relId),
            foreign: true,
            label,
            unit,
            xs: 12,
            sm: 6,
            md: 4,
        };
    }
    staticItem(label, data) {
        return {
            type: 'staticInfo',
            label,
            data,
            xs: 12,
            sm: 6,
            md: 4,
        };
    }
    header(text) {
        return { type: 'header', text, size: 4, newLine: true, xs: 12 };
    }
    getSensorDetails() {
        const config = this.adapter.config;
        const items = {};
        let anyEnabled = false;
        for (const { channel, flag, title, unit } of CHANNELS) {
            if (!config[flag]) {
                continue;
            }
            anyEnabled = true;
            items[`_${channel}`] = this.header((0, i18n_1.t)(title));
            for (const { axis, label } of AXES) {
                items[`${channel}_${axis}`] = this.stateItem(`${channel}.${axis}`, (0, i18n_1.t)(label), unit);
            }
            for (const { axis, label } of AXES) {
                items[`${channel}_${axis}Avg`] = this.stateItem(`${channel}.${axis}Avg`, (0, i18n_1.tWith)(label, ' Ø'), unit);
            }
        }
        if (config.waves) {
            anyEnabled = true;
            items._waves = this.header((0, i18n_1.t)('Waves'));
            for (const { id, label, unit } of WAVES) {
                items[`waves_${id}`] = this.stateItem(`waves.${id}`, (0, i18n_1.t)(label), unit);
            }
        }
        if (!anyEnabled) {
            items._nothing = { type: 'staticText', text: (0, i18n_1.t)('Nothing enabled'), xs: 12 };
        }
        items._connection = this.header((0, i18n_1.t)('Connection'));
        items.connected = this.stateItem('info.connection', (0, i18n_1.t)('Connection'));
        items.selectBy = this.staticItem((0, i18n_1.t)('Select device by'), config.selectBy === 'device' ? (0, i18n_1.t)('USB device ID') : (0, i18n_1.t)('Serial port'));
        items.port = this.staticItem(config.selectBy === 'device' ? (0, i18n_1.t)('USB device') : (0, i18n_1.t)('Serial port'), this.getConfiguredPort() || '—');
        items.baudRate = this.staticItem((0, i18n_1.t)('Baud rate'), String(config.baudRate || ''));
        items.openedPath = this.staticItem((0, i18n_1.t)('Opened port'), this.adapter.getOpenedPath() || '—');
        return { id: SENSOR_ID, schema: { type: 'panel', items } };
    }
    // ---------------------------------------------------------------------------------------------
    // Actions
    async onTest(context) {
        const progress = await context.openProgress((0, i18n_1.t)('Testing'), { indeterminate: true });
        let detected = false;
        let error = '';
        try {
            detected = await this.adapter.testConnection();
        }
        catch (e) {
            error = e.message || String(e);
        }
        await progress.close();
        if (error) {
            await context.showMessage((0, i18n_1.tWith)('Test failed', `: ${error}`));
        }
        else {
            await context.showMessage((0, i18n_1.t)(detected ? 'Sensor detected' : 'Sensor not detected'));
        }
        return { refresh: 'none' };
    }
    async onEdit(context) {
        const config = this.adapter.config;
        const [ports, devices] = await Promise.all([
            this.adapter.listPortOptions().catch(() => []),
            this.adapter.listDeviceOptions().catch(() => []),
        ]);
        // Keep the configured port selectable, even if it is not plugged in right now
        if (config.serialPort && !ports.some(p => p.value === config.serialPort)) {
            ports.unshift({ value: config.serialPort, label: config.serialPort });
        }
        if (config.serialPortDeviceId && !devices.some(d => d.value === config.serialPortDeviceId)) {
            devices.unshift({ value: config.serialPortDeviceId, label: config.serialPortDeviceId });
        }
        const result = await context.showForm({
            type: 'panel',
            items: {
                selectBy: {
                    type: 'select',
                    label: (0, i18n_1.t)('Select device by'),
                    options: [
                        { value: 'port', label: (0, i18n_1.t)('Serial port') },
                        { value: 'device', label: (0, i18n_1.t)('USB device ID') },
                    ],
                    xs: 12,
                },
                serialPort: {
                    type: 'select',
                    label: (0, i18n_1.t)('Serial port'),
                    options: ports,
                    noTranslation: true,
                    hidden: "data.selectBy === 'device'",
                    newLine: true,
                    xs: 12,
                },
                serialPortDeviceId: {
                    type: 'select',
                    label: (0, i18n_1.t)('USB device'),
                    options: devices,
                    noTranslation: true,
                    hidden: "data.selectBy !== 'device'",
                    newLine: true,
                    xs: 12,
                },
                baudRate: {
                    type: 'select',
                    label: (0, i18n_1.t)('Baud rate'),
                    options: BAUD_RATES.map(rate => ({ value: rate, label: String(rate) })),
                    noTranslation: true,
                    newLine: true,
                    xs: 12,
                },
            },
        }, {
            data: {
                selectBy: config.selectBy === 'device' ? 'device' : 'port',
                serialPort: config.serialPort || '',
                serialPortDeviceId: config.serialPortDeviceId || '',
                baudRate: parseInt(config.baudRate, 10) || 115200,
            },
            title: (0, i18n_1.t)('Connection settings'),
            buttons: ['apply', 'cancel'],
        });
        if (!result) {
            return { refresh: 'none' };
        }
        const changes = {
            selectBy: result.selectBy === 'device' ? 'device' : 'port',
            serialPort: String(result.serialPort ?? ''),
            serialPortDeviceId: String(result.serialPortDeviceId ?? ''),
            baudRate: parseInt(String(result.baudRate), 10) || 115200,
        };
        const unchanged = changes.selectBy === (config.selectBy === 'device' ? 'device' : 'port') &&
            changes.serialPort === (config.serialPort || '') &&
            changes.serialPortDeviceId === (config.serialPortDeviceId || '') &&
            changes.baudRate === (parseInt(config.baudRate, 10) || 115200);
        if (unchanged) {
            return { refresh: 'none' };
        }
        await this.adapter.saveConfig(changes);
        await context.showMessage((0, i18n_1.t)('Settings changed'));
        return { refresh: 'devices' };
    }
}
exports.WitMotionDeviceManagement = WitMotionDeviceManagement;
//# sourceMappingURL=DeviceManagement.js.map