import {
    DeviceManagement,
    type ActionContext,
    type ConfigItemAny,
    type DeviceDetails,
    type DeviceInfo,
    type DeviceLoadContext,
    type DeviceRefreshResponse,
    type InstanceDetails,
    type StatusIndicator,
} from '@iobroker/dm-utils';
import type { AdapterInstance } from '@iobroker/adapter-core';
import type { WitMotionAdapterConfig } from '../types';
import { t, tWith, type WordKey } from './i18n';

/** A choice of the connection form */
export interface PortOption {
    value: string;
    label: string;
}

/** What the device manager needs from the adapter */
export interface WitMotionAdapterApi extends AdapterInstance {
    config: WitMotionAdapterConfig;
    /** Path of the serial port that is open right now, or an empty string */
    getOpenedPath(): string;
    /** Serial ports of this host by their path */
    listPortOptions(): Promise<PortOption[]>;
    /** USB serial devices of this host by their stable ID */
    listDeviceOptions(): Promise<PortOption[]>;
    /** Listens on the configured port for sensor packets. Throws if the port cannot be resolved or opened */
    testConnection(): Promise<boolean>;
    /** Writes a part of the configuration. The adapter restarts afterwards */
    saveConfig(changes: Partial<WitMotionAdapterConfig>): Promise<void>;
}

/** The adapter reads exactly one sensor, so there is exactly one device */
const SENSOR_ID = 'sensor';

const BAUD_RATES = [4800, 9600, 19200, 38400, 57600, 115200];

function svgIcon(path: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="${path}"/></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const ICON_SENSOR = svgIcon(
    'M6 4h12v1h3v2h-3v2h3v2h-3v2h3v2h-3v2h3v2h-3v1H6v-1H3v-2h3v-2H3v-2h3v-2H3V9h3V7H3V5h3zm5 11v3h1v-3zm2 0v3h1v-3zm2 0v3h1v-3z',
);
const ICON_ANGLE = svgIcon(
    'M20 19H4.09L14.18 4.43l1.64 1.14-4.54 6.56A4.5 4.5 0 0 1 14 16.54c0 .16 0 .31-.03.46H20zM7.91 17h4.05c.04-.15.04-.3.04-.46 0-1.26-.76-2.32-1.86-2.76z',
);
const ICON_COMPASS = svgIcon(
    'M7 17l3.2-6.8L17 7l-3.2 6.8zm5-5.9a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20m0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16',
);

/** The measured channels: the config flag that enables them, their heading and unit */
const CHANNELS: {
    channel: string;
    flag: 'accelerometer' | 'gyroscope' | 'magnetometer';
    title: WordKey;
    unit: string;
}[] = [
    { channel: 'angle', flag: 'magnetometer', title: 'Magnetometer', unit: '°' },
    { channel: 'acceleration', flag: 'accelerometer', title: 'Acceleration', unit: 'g' },
    { channel: 'gyroscope', flag: 'gyroscope', title: 'Gyroscope', unit: '°/s' },
];

const AXES: { axis: 'x' | 'y' | 'z'; label: WordKey }[] = [
    { axis: 'x', label: 'Roll (X)' },
    { axis: 'y', label: 'Pitch (Y)' },
    { axis: 'z', label: 'Yaw (Z)' },
];

export class WitMotionDeviceManagement extends DeviceManagement<WitMotionAdapterApi> {
    private full(relId: string): string {
        return `${this.adapter.namespace}.${relId}`;
    }

    private isPortConfigured(): boolean {
        const config = this.adapter.config;
        return config.selectBy === 'device' ? !!config.serialPortDeviceId : !!config.serialPort;
    }

    /** The configured port as the user knows it: the port name or the USB device ID */
    private getConfiguredPort(): string {
        const config = this.adapter.config;
        return (config.selectBy === 'device' ? config.serialPortDeviceId : config.serialPort) || '';
    }

    protected override getInstanceInfo(): InstanceDetails {
        return {
            apiVersion: 'v3',
            identifierLabel: t('Serial port'),
        };
    }

    protected override loadDevices(context: DeviceLoadContext<string>): void {
        context.setTotalDevices(1);
        context.addDevice(this.getSensorInfo());
    }

    protected override getDeviceDetails(id: string): Promise<DeviceDetails<string> | null | { error: string }> {
        if (id !== SENSOR_ID) {
            return Promise.resolve({ error: `Unknown device ${id}` });
        }
        return Promise.resolve(this.getSensorDetails());
    }

    // ---------------------------------------------------------------------------------------------
    // Card

    private getIndicators(): StatusIndicator[] {
        if (!this.adapter.config.magnetometer) {
            return [];
        }
        return AXES.map(({ axis, label }, i) => ({
            id: `angle_${axis}`,
            value: { stateId: this.full(`angle.${axis}`) },
            icon: axis === 'z' ? ICON_COMPASS : ICON_ANGLE,
            color: 'info',
            showValue: true,
            unit: '°',
            tooltip: t(label),
            configurable: true,
            order: 10 * (i + 1),
        }));
    }

    private getSensorInfo(): DeviceInfo<string> {
        const configured = this.isPortConfigured();
        const info: DeviceInfo<string> = {
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
                warning: configured ? undefined : t('No serial port configured'),
            },
            indicators: this.getIndicators(),
            hasDetails: true,
            actions: [
                {
                    id: 'edit',
                    icon: 'edit',
                    description: t('Connection settings'),
                    handler: (_id: string, context: ActionContext): Promise<DeviceRefreshResponse<string>> =>
                        this.onEdit(context),
                },
            ],
        };
        if (configured) {
            info.actions!.unshift({
                id: 'test',
                icon: 'play',
                description: t('Test connection'),
                handler: (_id: string, context: ActionContext): Promise<DeviceRefreshResponse<string>> =>
                    this.onTest(context),
            });
        }
        return info;
    }

    // ---------------------------------------------------------------------------------------------
    // Details

    private stateItem(relId: string, label: ioBroker.StringOrTranslated, unit?: string): ConfigItemAny {
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

    private staticItem(label: ioBroker.StringOrTranslated, data: ioBroker.StringOrTranslated | number): ConfigItemAny {
        return {
            type: 'staticInfo',
            label,
            data,
            xs: 12,
            sm: 6,
            md: 4,
        };
    }

    private header(text: ioBroker.StringOrTranslated): ConfigItemAny {
        return { type: 'header', text, size: 4, newLine: true, xs: 12 };
    }

    private getSensorDetails(): DeviceDetails<string> {
        const config = this.adapter.config;
        const items: Record<string, ConfigItemAny> = {};

        let anyEnabled = false;
        for (const { channel, flag, title, unit } of CHANNELS) {
            if (!config[flag]) {
                continue;
            }
            anyEnabled = true;
            items[`_${channel}`] = this.header(t(title));
            for (const { axis, label } of AXES) {
                items[`${channel}_${axis}`] = this.stateItem(`${channel}.${axis}`, t(label), unit);
            }
            for (const { axis, label } of AXES) {
                items[`${channel}_${axis}Avg`] = this.stateItem(`${channel}.${axis}Avg`, tWith(label, ' Ø'), unit);
            }
        }
        if (!anyEnabled) {
            items._nothing = { type: 'staticText', text: t('Nothing enabled'), xs: 12 };
        }

        items._connection = this.header(t('Connection'));
        items.connected = this.stateItem('info.connection', t('Connection'));
        items.selectBy = this.staticItem(
            t('Select device by'),
            config.selectBy === 'device' ? t('USB device ID') : t('Serial port'),
        );
        items.port = this.staticItem(
            config.selectBy === 'device' ? t('USB device') : t('Serial port'),
            this.getConfiguredPort() || '—',
        );
        items.baudRate = this.staticItem(t('Baud rate'), String(config.baudRate || ''));
        items.openedPath = this.staticItem(t('Opened port'), this.adapter.getOpenedPath() || '—');

        return { id: SENSOR_ID, schema: { type: 'panel', items } };
    }

    // ---------------------------------------------------------------------------------------------
    // Actions

    private async onTest(context: ActionContext): Promise<DeviceRefreshResponse<string>> {
        const progress = await context.openProgress(t('Testing'), { indeterminate: true });
        let detected = false;
        let error = '';
        try {
            detected = await this.adapter.testConnection();
        } catch (e) {
            error = (e as Error).message || String(e);
        }
        await progress.close();
        if (error) {
            await context.showMessage(tWith('Test failed', `: ${error}`));
        } else {
            await context.showMessage(t(detected ? 'Sensor detected' : 'Sensor not detected'));
        }
        return { refresh: 'none' };
    }

    private async onEdit(context: ActionContext): Promise<DeviceRefreshResponse<string>> {
        const config = this.adapter.config;
        const [ports, devices] = await Promise.all([
            this.adapter.listPortOptions().catch((): PortOption[] => []),
            this.adapter.listDeviceOptions().catch((): PortOption[] => []),
        ]);
        // Keep the configured port selectable, even if it is not plugged in right now
        if (config.serialPort && !ports.some(p => p.value === config.serialPort)) {
            ports.unshift({ value: config.serialPort, label: config.serialPort });
        }
        if (config.serialPortDeviceId && !devices.some(d => d.value === config.serialPortDeviceId)) {
            devices.unshift({ value: config.serialPortDeviceId, label: config.serialPortDeviceId });
        }

        const result = await context.showForm(
            {
                type: 'panel',
                items: {
                    selectBy: {
                        type: 'select',
                        label: t('Select device by'),
                        options: [
                            { value: 'port', label: t('Serial port') },
                            { value: 'device', label: t('USB device ID') },
                        ],
                        xs: 12,
                    },
                    serialPort: {
                        type: 'select',
                        label: t('Serial port'),
                        options: ports,
                        noTranslation: true,
                        hidden: "data.selectBy === 'device'",
                        newLine: true,
                        xs: 12,
                    },
                    serialPortDeviceId: {
                        type: 'select',
                        label: t('USB device'),
                        options: devices,
                        noTranslation: true,
                        hidden: "data.selectBy !== 'device'",
                        newLine: true,
                        xs: 12,
                    },
                    baudRate: {
                        type: 'select',
                        label: t('Baud rate'),
                        options: BAUD_RATES.map(rate => ({ value: rate, label: String(rate) })),
                        noTranslation: true,
                        newLine: true,
                        xs: 12,
                    },
                },
            },
            {
                data: {
                    selectBy: config.selectBy === 'device' ? 'device' : 'port',
                    serialPort: config.serialPort || '',
                    serialPortDeviceId: config.serialPortDeviceId || '',
                    baudRate: parseInt(config.baudRate as string, 10) || 115200,
                },
                title: t('Connection settings'),
                buttons: ['apply', 'cancel'],
            },
        );
        if (!result) {
            return { refresh: 'none' };
        }

        const changes: Partial<WitMotionAdapterConfig> = {
            selectBy: result.selectBy === 'device' ? 'device' : 'port',
            serialPort: String(result.serialPort ?? ''),
            serialPortDeviceId: String(result.serialPortDeviceId ?? ''),
            baudRate: parseInt(String(result.baudRate), 10) || 115200,
        };
        const unchanged =
            changes.selectBy === (config.selectBy === 'device' ? 'device' : 'port') &&
            changes.serialPort === (config.serialPort || '') &&
            changes.serialPortDeviceId === (config.serialPortDeviceId || '') &&
            changes.baudRate === (parseInt(config.baudRate as string, 10) || 115200);
        if (unchanged) {
            return { refresh: 'none' };
        }
        await this.adapter.saveConfig(changes);
        await context.showMessage(t('Settings changed'));
        return { refresh: 'devices' };
    }
}
