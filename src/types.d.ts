export interface WitMotionAdapterConfig {
    serialPort: string;
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

    test?: boolean;
}
