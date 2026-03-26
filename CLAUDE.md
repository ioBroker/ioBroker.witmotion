# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

ioBroker adapter for WitMotion WT901blecl 5.0 (9-axis IMU sensor). Reads acceleration, gyroscope, and magnetometer data via USB serial port and writes values to ioBroker states. Includes a UDP test mode (port 50547) for development without physical hardware.

## Commands

- **Build:** `npm run build` (TypeScript via `tsc -p tsconfig.build.json`, output to `build/`)
- **Lint:** `npm run lint`
- **Test all:** `npm test` (runs integration tests)
- **Integration tests:** `npm run test:integration` (mocha, requires js-controller instance)
- **Package validation:** `npm run test:package` (validates package.json and io-package.json structure)
- **Release:** `npm run release-patch`, `npm run release-minor`, `npm run release-major`

## Architecture

Single-file adapter in `src/main.ts`. The `WitMotionAdapter` class extends `@iobroker/adapter-core`'s `Adapter`.

### Data Flow

Serial port (or UDP in test mode) → byte stream → accumulate 20-byte packets (header `0x55 0x61` + 18 data bytes) → `processData()` decodes acceleration/gyroscope/angle → `setStateIfChangedAsync()` applies change detection, minimum update interval, sliding average calculation, and optional 0-360° magnetometer transformation → ioBroker states.

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
