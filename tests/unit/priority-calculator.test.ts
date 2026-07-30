import { describe, it, expect } from "vitest";
import { PriorityCalculator, createPriorityCalculator } from "../../src/modules/priority-calculator/index.js";
import type { SessionParams, ActiveSession } from "../../src/interfaces/priority-calculator.interface.js";

describe("PriorityCalculator", () => {
  const calculator = new PriorityCalculator();

  describe("calculatePriority", () => {
    it("should calculate priority using the formula: (battery_capacity * (1 - SOC)) / charger_power_rating", () => {
      const session: SessionParams = {
        batteryCapacity: 60,      // kWh
        initialSOC: 0.40,         // 40%
        chargerPowerRating: 7.2,  // kW
        isGuest: false,
        guestSpecsProvided: false,
      };

      // (60 * (1 - 0.40)) / 7.2 = (60 * 0.60) / 7.2 = 36 / 7.2 = 5.0
      const priority = calculator.calculatePriority(session);
      expect(priority).toBeCloseTo(5.0, 5);
    });

    it("should default SOC to 0.20 when initialSOC is not in valid range", () => {
      const session: SessionParams = {
        batteryCapacity: 50,
        initialSOC: -1, // invalid
        chargerPowerRating: 10,
        isGuest: false,
        guestSpecsProvided: false,
      };

      // (50 * (1 - 0.20)) / 10 = (50 * 0.80) / 10 = 40 / 10 = 4.0
      const priority = calculator.calculatePriority(session);
      expect(priority).toBeCloseTo(4.0, 5);
    });

    it("should return priority 0 for guest without specs", () => {
      const session: SessionParams = {
        batteryCapacity: 60,
        initialSOC: 0.50,
        chargerPowerRating: 7.2,
        isGuest: true,
        guestSpecsProvided: false,
      };

      const priority = calculator.calculatePriority(session);
      expect(priority).toBe(0);
    });

    it("should calculate priority for guest with specs", () => {
      const session: SessionParams = {
        batteryCapacity: 40,
        initialSOC: 0.30,
        chargerPowerRating: 3.3,
        isGuest: true,
        guestSpecsProvided: true,
      };

      // (40 * (1 - 0.30)) / 3.3 = (40 * 0.70) / 3.3 = 28 / 3.3 ≈ 8.4848
      const priority = calculator.calculatePriority(session);
      expect(priority).toBeCloseTo(28 / 3.3, 5);
    });

    it("should return 0 when chargerPowerRating is 0 (avoid division by zero)", () => {
      const session: SessionParams = {
        batteryCapacity: 60,
        initialSOC: 0.50,
        chargerPowerRating: 0,
        isGuest: false,
        guestSpecsProvided: false,
      };

      const priority = calculator.calculatePriority(session);
      expect(priority).toBe(0);
    });

    it("should return 0 when batteryCapacity is 0", () => {
      const session: SessionParams = {
        batteryCapacity: 0,
        initialSOC: 0.50,
        chargerPowerRating: 7.2,
        isGuest: false,
        guestSpecsProvided: false,
      };

      const priority = calculator.calculatePriority(session);
      expect(priority).toBe(0);
    });

    it("should handle SOC of 1.0 (fully charged) resulting in priority 0", () => {
      const session: SessionParams = {
        batteryCapacity: 60,
        initialSOC: 1.0,
        chargerPowerRating: 7.2,
        isGuest: false,
        guestSpecsProvided: false,
      };

      // (60 * (1 - 1.0)) / 7.2 = 0
      const priority = calculator.calculatePriority(session);
      expect(priority).toBe(0);
    });

    it("should handle SOC of 0.0 (empty battery)", () => {
      const session: SessionParams = {
        batteryCapacity: 60,
        initialSOC: 0.0,
        chargerPowerRating: 7.2,
        isGuest: false,
        guestSpecsProvided: false,
      };

      // (60 * (1 - 0.0)) / 7.2 = 60 / 7.2 ≈ 8.333
      const priority = calculator.calculatePriority(session);
      expect(priority).toBeCloseTo(60 / 7.2, 5);
    });
  });

  describe("resolveTieBreaker", () => {
    it("should return the nodeId with the smallest startTimestamp (longest running)", () => {
      const sessions: ActiveSession[] = [
        { nodeId: "node-1", priorityScore: 5, startTimestamp: 1000 },
        { nodeId: "node-2", priorityScore: 5, startTimestamp: 500 },
        { nodeId: "node-3", priorityScore: 5, startTimestamp: 1500 },
      ];

      const result = calculator.resolveTieBreaker(sessions);
      expect(result).toBe("node-2"); // smallest timestamp = longest running
    });

    it("should return empty string for empty sessions array", () => {
      const result = calculator.resolveTieBreaker([]);
      expect(result).toBe("");
    });

    it("should return the single session's nodeId when only one session exists", () => {
      const sessions: ActiveSession[] = [
        { nodeId: "node-1", priorityScore: 3, startTimestamp: 1000 },
      ];

      const result = calculator.resolveTieBreaker(sessions);
      expect(result).toBe("node-1");
    });

    it("should correctly identify the longest running among many sessions", () => {
      const sessions: ActiveSession[] = [
        { nodeId: "node-a", priorityScore: 2, startTimestamp: 5000 },
        { nodeId: "node-b", priorityScore: 2, startTimestamp: 3000 },
        { nodeId: "node-c", priorityScore: 2, startTimestamp: 100 },
        { nodeId: "node-d", priorityScore: 2, startTimestamp: 4000 },
      ];

      const result = calculator.resolveTieBreaker(sessions);
      expect(result).toBe("node-c"); // startTimestamp 100 = longest running
    });
  });

  describe("createPriorityCalculator factory", () => {
    it("should create a valid IPriorityCalculator instance", () => {
      const instance = createPriorityCalculator();
      expect(instance).toBeDefined();
      expect(typeof instance.calculatePriority).toBe("function");
      expect(typeof instance.resolveTieBreaker).toBe("function");
    });
  });
});
