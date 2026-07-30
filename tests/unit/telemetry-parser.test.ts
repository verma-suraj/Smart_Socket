import { describe, it, expect } from 'vitest';
import { parseTelemetryPayload } from '../../src/modules/mqtt-transport/payload-parser.js';

describe('parseTelemetryPayload', () => {
  const validPayload = {
    v: 230.5,
    i: 12.3,
    p: 2835.15,
    f: 50.0,
    pf: 0.98,
    t: 35.2,
    ts: 1690001234,
  };

  describe('valid payloads', () => {
    it('parses a valid JSON string payload', () => {
      const result = parseTelemetryPayload(JSON.stringify(validPayload));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload).toEqual({
          voltage: 230.5,
          current: 12.3,
          power: 2835.15,
          frequency: 50.0,
          powerFactor: 0.98,
          temperature: 35.2,
          timestamp: 1690001234,
        });
      }
    });

    it('parses a valid Buffer payload', () => {
      const buffer = Buffer.from(JSON.stringify(validPayload), 'utf-8');
      const result = parseTelemetryPayload(buffer);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.voltage).toBe(230.5);
        expect(result.payload.power).toBe(2835.15);
      }
    });

    it('uses power value directly from payload (not V×I)', () => {
      // p !== v * i to prove we use p directly
      const payload = { ...validPayload, v: 100, i: 10, p: 500 };
      const result = parseTelemetryPayload(JSON.stringify(payload));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.power).toBe(500); // not 100 * 10 = 1000
      }
    });

    it('accepts zero values as valid numeric fields', () => {
      const payload = { v: 0, i: 0, p: 0, f: 0, pf: 0, t: 0, ts: 0 };
      const result = parseTelemetryPayload(JSON.stringify(payload));

      expect(result.success).toBe(true);
    });

    it('accepts negative values as valid numeric fields', () => {
      const payload = { v: -1, i: -2, p: -3, f: -4, pf: -5, t: -10, ts: -1 };
      const result = parseTelemetryPayload(JSON.stringify(payload));

      expect(result.success).toBe(true);
    });

    it('ignores extra fields in the payload', () => {
      const payload = { ...validPayload, extra: 'ignored', another: 42 };
      const result = parseTelemetryPayload(JSON.stringify(payload));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.voltage).toBe(230.5);
      }
    });
  });

  describe('invalid JSON', () => {
    it('rejects non-JSON string', () => {
      const result = parseTelemetryPayload('not json at all');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid JSON');
      }
    });

    it('rejects empty string', () => {
      const result = parseTelemetryPayload('');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid JSON');
      }
    });

    it('rejects empty Buffer', () => {
      const result = parseTelemetryPayload(Buffer.from(''));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid JSON');
      }
    });
  });

  describe('invalid payload structure', () => {
    it('rejects null JSON value', () => {
      const result = parseTelemetryPayload('null');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('expected a JSON object');
      }
    });

    it('rejects JSON array', () => {
      const result = parseTelemetryPayload('[1, 2, 3]');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('expected a JSON object');
      }
    });

    it('rejects JSON number', () => {
      const result = parseTelemetryPayload('42');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('expected a JSON object');
      }
    });
  });

  describe('missing fields', () => {
    it('rejects payload missing a single field', () => {
      const { v, ...rest } = validPayload;
      const result = parseTelemetryPayload(JSON.stringify(rest));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Missing required fields');
        expect(result.error).toContain('v');
      }
    });

    it('rejects payload missing multiple fields', () => {
      const { v, i, pf, ...rest } = validPayload;
      const result = parseTelemetryPayload(JSON.stringify(rest));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Missing required fields');
        expect(result.error).toContain('v');
        expect(result.error).toContain('i');
        expect(result.error).toContain('pf');
      }
    });

    it('rejects empty object', () => {
      const result = parseTelemetryPayload('{}');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Missing required fields');
      }
    });
  });

  describe('non-numeric fields', () => {
    it('rejects string value for a numeric field', () => {
      const payload = { ...validPayload, v: 'not a number' };
      const result = parseTelemetryPayload(JSON.stringify(payload));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Non-numeric fields');
        expect(result.error).toContain('v');
      }
    });

    it('rejects null value for a numeric field', () => {
      const payload = { ...validPayload, i: null };
      const result = parseTelemetryPayload(JSON.stringify(payload));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Non-numeric fields');
        expect(result.error).toContain('i');
      }
    });

    it('rejects boolean value for a numeric field', () => {
      const payload = { ...validPayload, pf: true };
      const result = parseTelemetryPayload(JSON.stringify(payload));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Non-numeric fields');
        expect(result.error).toContain('pf');
      }
    });

    it('rejects multiple non-numeric fields', () => {
      const payload = { ...validPayload, v: 'bad', t: null, ts: false };
      const result = parseTelemetryPayload(JSON.stringify(payload));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Non-numeric fields');
        expect(result.error).toContain('v');
        expect(result.error).toContain('t');
        expect(result.error).toContain('ts');
      }
    });
  });
});
