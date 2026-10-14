# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

ioBroker adapter for WitMotion WT901blecl 5.0 (9-axis IMU sensor). Reads acceleration, gyroscope, and magnetometer data via USB serial port and writes values to ioBroker states. Includes a UDP test mode (port 50547) for development without physical hardware.

## Commands

- **Build:** `npm run build` — two stages: (1) `tsc -p tsconfig.build.json` compiles the adapter to `build/`, then (2) `tsx tasks.ts` builds the React tile for the devices app from `src-devices/` (→ `admin/dm-widgets/`) and the vis-2 widget set from `src-widgets/` (→ `widgets/witmotion/`). The `tasks.ts` step (run with `tsx`, e.g. `npx tsx tasks.ts --3-copy`) can run in phases: `--0-clean`, `--1-npm` (install `src-devices` and `src-widgets` deps), `--2-build` (Vite builds), `--3-copy`. Both outputs are gitignored and built on publish.
- **Lint:** `npm run lint`
- **Test all:** `npm test` (runs integration tests)
- **Integration tests:** `npm run test:integration` (mocha, requires js-controller instance)
- **Package validation:** `npm run test:package` (validates package.json and io-package.json structure)
- **Release:** `npm run release-patch`, `npm run release-minor`, `npm run release-major`

## Architecture

This repo holds the adapter and three front-end folders:

1. **The adapter** — backend in `src/main.ts`. The `WitMotionAdapter` class extends `@iobroker/adapter-core`'s `Adapter`. This is the runtime that talks to the sensor and writes states. `src/lib/DeviceManagement.ts` (`WitMotionDeviceManagement`, `@iobroker/dm-utils`) feeds admin's device manager: one card for the sensor, details with all enabled values, actions "test connection" and "connection settings" (writes the config → restart). Its texts are in `src/lib/i18n.ts` (all languages inline). `dm:*` messages are answered by the device manager, so the adapter's own message handler skips them.
2. **`src-shared/`** — the orientation views (`OrientationView.tsx`, settings/helpers in `orientation.ts`), the boat/car pictures and the i18n (`wit_`-prefixed keys). Plain elements, no MUI and no hooks, so both hosts can render them with their own React.
3. **`src-devices/`** — the tile for ioBroker's "devices" app (`@iobroker/dm-widgets`), main component `WitMotionComponent.tsx`, built via module federation into `admin/dm-widgets/customDevices.js`. Draws only the tile frame and the dialog around the shared views.
4. **`src-widgets/`** — the vis-2 widget set (`WitMotionOrientation.tsx`), built via module federation into `widgets/witmotion/customWidgets.js`. Registered in `io-package.json` under `common.visWidgets`.

The three front-end folders have their own `package.json`/`node_modules`; `src-shared` resolves `react` from the project that builds it (Vite `dedupe`). Edit them only when changing the visualisation, not the sensor logic.

### Data Flow

Serial port (or UDP in test mode) → byte stream → accumulate 20-byte packets (header `0x55 0x61` + 18 data bytes) → `processData()` decodes acceleration/gyroscope/angle → for angle values, the configured `magnetometerOffset{X,Y,Z}` is added → `setStateIfChangedAsync()` applies change detection, minimum update interval, sliding average calculation, and optional 0-360° transformation (negative values + 360) → ioBroker states.

Each axis is gated by a config flag (`accelerometer` / `gyroscope` / `magnetometer`); only enabled groups are written. `setStateIfChangedAsync()` skips unchanged values unless the last write is older than 60s (heartbeat), then further throttles by the per-group `*Update` min interval, and maintains a sliding window (`*AverageInterval`) for the `*Avg` states.

### Key Methods

- `openPort()` / `closePort()` / `retryOpenPort()` — serial connection with 3-second auto-reconnect
- `process(data)` — byte accumulator that assembles 20-byte packets from stream chunks
- `processData(bytes)` — static, pure decoder: 18 bytes → `{acceleration, gyroscope, angle}` with X/Y/Z
- `setStateIfChangedAsync()` — change-gated state updates with configurable min interval and sliding window averages
- `syncAccelerationObjects()` / `syncGyroscopeObjects()` / `syncAngleObjects()` — create or delete ioBroker channel/state objects based on config
- Message handlers: `list` (enumerate serial ports), `test` (detect sensor on port/baud)

### State Structure

Each enabled sensor creates a channel with X/Y/Z values and their averages:
- `acceleration.{x,y,z}` / `acceleration.{x,y,z}Avg` (unit: g)
- `gyroscope.{x,y,z}` / `gyroscope.{x,y,z}Avg` (unit: °/s)
- `angle.{x,y,z}` / `angle.{x,y,z}Avg` (unit: °)

Naming quirk: the **`angle`** channel is the **magnetometer** — its states are labeled "Magnetometer …" and it is gated by the `magnetometer` config flag (and `magnetometer360{x,y,z}` / `magnetometerOffset{X,Y,Z}`), not an `angle` flag.

### Config Interface

Defined in `src/types.d.ts` as `WitMotionAdapterConfig`. Admin UI schema in `admin/jsonConfig.json`.

## Testing

Integration tests (`test/adapter.test.js`) use `@iobroker/legacy-testing` to start a js-controller instance, then send mock sensor packets via UDP to the adapter running in test mode. Test data is in `test/data.json` (hex-encoded 20-byte packets).

## ESLint

Uses `@iobroker/eslint-config`. JSDoc rules (`require-jsdoc`, `require-param`, `check-param-names`) are disabled. Lint ignores `build/`, `admin/`, `test/`, `tmp/`, and `*.mjs`.

## Sensor Protocol

Packets are 20 bytes: `[0x55, 0x61, <18 data bytes>]`. Data bytes are 9 little-endian signed 16-bit values decoded as:
- Bytes 0-5: Acceleration X/Y/Z (range ±16g, formula: `value / 32768 * 16`)
- Bytes 6-11: Gyroscope X/Y/Z (range ±2000°/s, formula: `value / 32768 * 2000`)
- Bytes 12-17: Angle X/Y/Z (range ±180°, formula: `value / 32768 * 180`)
