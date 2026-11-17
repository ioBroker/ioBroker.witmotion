export interface WitMotionAdapterConfig {
    /** How the serial device is selected: by port name or by stable USB device ID */
    selectBy: 'port' | 'device';
    serialPort: string;
    /** Stable USB identifier (`vendorId:productId:serialNumber`) used when selectBy === 'device' */
    serialPortDeviceId: string;
    baudRate: number | string;

    accelerometer: boolean;
    accelerometerUpdate: number | string;
    accelerometerAverageInterval: number | string;

    gyroscope: boolean;
    gyroscopeUpdate: number | string;
    gyroscopeAverageInterval: number | string;

    magnetometer: boolean;
    magnetometerUpdate: number | string;
    magnetometerAverageInterval: number | string;
    magnetometer360x: boolean;
    magnetometer360y: boolean;
    magnetometer360z: boolean;
    magnetometerOffsetX: number | string;
    magnetometerOffsetY: number | string;
    magnetometerOffsetZ: number | string;

    /** Wave statistics from the heave of the sensor (`waves.*` states) */
    waves: boolean;
    /** How often the wave states are written, s */
    wavesUpdate: number | string;
    /** Length of the analysed record, s */
    wavesWindow: number | string;
    /** Shortest wave period that is counted, s */
    wavesMinPeriod: number | string;
    /** Longest wave period that is counted, s */
    wavesMaxPeriod: number | string;

    test?: boolean;
}
