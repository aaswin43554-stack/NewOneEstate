'use strict';

const EventEmitter = require('events');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const BAUD_RATE = 115200;
const POLL_MS   = 2000;

// Emits:
//   'reading'    ({bt, et?, ambient?, heaterDuty?, exhaustDuty?}) — one sample per poll, °C / %
//   'disconnect' (Error)   — port closed or errored; caller should null-out the instance
class SkywalkerSerial extends EventEmitter {
  constructor(portPath) {
    super();
    this.portPath  = portPath;
    this.port      = null;
    this.connected = false;
    this._poll     = null;
  }

  open() {
    return new Promise((resolve, reject) => {
      const port = new SerialPort({ path: this.portPath, baudRate: BAUD_RATE, autoOpen: false });

      // TC4 / Skyduino protocol: ASCII lines, comma-separated
      // Response to READ: ambient,BT,ET[,heater_duty,exhaust_duty]
      const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
      parser.on('data', (line) => {
        const parts = line.trim().split(',');
        if (parts.length < 2) return;

        const ambient = parseFloat(parts[0]);
        const bt      = parseFloat(parts[1]);
        const et      = parts.length > 2 ? parseFloat(parts[2]) : NaN;
        if (isNaN(bt)) return;

        const reading = { bt: Math.round(bt) };
        if (!isNaN(ambient)) reading.ambient = Math.round(ambient);
        if (!isNaN(et)) reading.et = Math.round(et);
        if (parts.length > 3) {
          const heaterDuty = parseFloat(parts[3]);
          if (!isNaN(heaterDuty)) reading.heaterDuty = Math.round(heaterDuty);
        }
        if (parts.length > 4) {
          const exhaustDuty = parseFloat(parts[4]);
          if (!isNaN(exhaustDuty)) reading.exhaustDuty = Math.round(exhaustDuty);
        }

        this.emit('reading', reading);
      });

      port.on('error', (err) => {
        console.error(`[serial] ${this.portPath}: ${err.message}`);
        this._teardown(err);
      });
      port.on('close', () => this._teardown(new Error('Port closed')));

      port.open((err) => {
        if (err) return reject(err);
        this.port      = port;
        this.connected = true;
        // Poll the roaster every POLL_MS — READ command elicits one response line
        this._poll = setInterval(() => {
          if (port.isOpen) port.write('READ\n');
        }, POLL_MS);
        resolve();
      });
    });
  }

  _teardown(err) {
    if (!this.connected) return;
    this.connected = false;
    clearInterval(this._poll);
    this._poll = null;
    this.emit('disconnect', err);
  }

  close() {
    this._teardown(new Error('Manual close'));
    if (this.port && this.port.isOpen) this.port.close();
  }
}

module.exports = { SkywalkerSerial };
