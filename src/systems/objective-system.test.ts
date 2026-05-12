import { assert } from "chai";
import { ObjectiveSystem } from "./objective-system";
import { ColonyManager, BaseSystem } from "prototypes/types";
import { Objective } from "../objectives/types";

describe("ObjectiveSystem", () => {
    let mockColony: ColonyManager;
    let mockSystems: BaseSystem[];

    function createMockObjective(name: string, priority: number, ready = true, complete = false): Objective {
        return {
            name,
            priority,
            isReady: () => ready,
            isComplete: () => complete,
            execute: () => {},
        };
    }

    beforeEach(() => {
        mockSystems = [];
        mockColony = {
            colonyInfo: {},
            getSystemsList: () => mockSystems,
        } as any;
    });

    it("should correctly aggregate objectives from all colony systems", () => {
        const obj1 = createMockObjective("Obj1", 10);
        const obj2 = createMockObjective("Obj2", 20);

        const system1 = { getObjectives: () => [obj1] } as any;
        const system2 = { getObjectives: () => [obj2] } as any;
        mockSystems.push(system1, system2);

        const objectiveSystem = new ObjectiveSystem(mockColony);
        // @ts-ignore - accessing private method for testing
        const allObjectives = objectiveSystem.getAllObjectives();

        assert.strictEqual(allObjectives.length, 2);
        assert.include(allObjectives, obj1);
        assert.include(allObjectives, obj2);
    });

    it("should select the highest priority objective that is ready and not complete", () => {
        const objLow = createMockObjective("Low", 10);
        const objHigh = createMockObjective("High", 50);
        const objHigherButNotReady = createMockObjective("HigherNotReady", 100, false);
        const objHigherButComplete = createMockObjective("HigherComplete", 100, true, true);

        mockSystems.push({
            getObjectives: () => [objLow, objHigh, objHigherButNotReady, objHigherButComplete],
        } as any);

        const objectiveSystem = new ObjectiveSystem(mockColony);
        objectiveSystem.run();

        assert.strictEqual(objectiveSystem.activeObjective, objHigh);
    });

    it("should switch to a higher priority objective if one becomes available", () => {
        const objLow = createMockObjective("Low", 10);
        const objHigh = createMockObjective("High", 50);

        const system = { getObjectives: () => [objLow] } as any;
        mockSystems.push(system);

        const objectiveSystem = new ObjectiveSystem(mockColony);

        // Initial run with only low priority
        objectiveSystem.run();
        assert.strictEqual(objectiveSystem.activeObjective, objLow);

        // Add high priority objective
        system.getObjectives = () => [objLow, objHigh];
        objectiveSystem.run();
        assert.strictEqual(objectiveSystem.activeObjective, objHigh);
    });

    it("should clear the current objective if it becomes complete", () => {
        let isComplete = false;
        const obj = {
            name: "TestObj",
            priority: 10,
            isReady: () => true,
            isComplete: () => isComplete,
            execute: () => {},
        };

        mockSystems.push({ getObjectives: () => [obj] } as any);

        const objectiveSystem = new ObjectiveSystem(mockColony);
        objectiveSystem.run();
        assert.strictEqual(objectiveSystem.activeObjective, obj);

        isComplete = true;
        objectiveSystem.run();
        assert.isNull(objectiveSystem.activeObjective);
    });

    it("should clear the current objective if it is no longer ready", () => {
        let isReady = true;
        const obj = {
            name: "TestObj",
            priority: 10,
            isReady: () => isReady,
            isComplete: () => false,
            execute: () => {},
        };

        mockSystems.push({ getObjectives: () => [obj] } as any);

        const objectiveSystem = new ObjectiveSystem(mockColony);
        objectiveSystem.run();
        assert.strictEqual(objectiveSystem.activeObjective, obj);

        isReady = false;
        objectiveSystem.run();
        assert.isNull(objectiveSystem.activeObjective);
    });

    it("should correctly call execute() on the active objective", () => {
        let executed = false;
        const obj = createMockObjective("TestObj", 10);
        obj.execute = () => {
            executed = true;
        };

        mockSystems.push({ getObjectives: () => [obj] } as any);

        const objectiveSystem = new ObjectiveSystem(mockColony);
        objectiveSystem.run();

        assert.isTrue(executed);
    });

    it("should handle cases where no objectives are ready", () => {
        const objNotReady = createMockObjective("NotReady", 10, false);
        mockSystems.push({ getObjectives: () => [objNotReady] } as any);

        const objectiveSystem = new ObjectiveSystem(mockColony);
        objectiveSystem.run();

        assert.isNull(objectiveSystem.activeObjective);
    });

    it("should stay with the current objective if a new objective has the same priority", () => {
        const obj1 = createMockObjective("Obj1", 50);
        const obj2 = createMockObjective("Obj2", 50);

        const system = { getObjectives: () => [obj1] } as any;
        mockSystems.push(system);

        const objectiveSystem = new ObjectiveSystem(mockColony);

        // Initial run picks obj1
        objectiveSystem.run();
        assert.strictEqual(objectiveSystem.activeObjective, obj1);

        // Add obj2 with same priority
        system.getObjectives = () => [obj1, obj2];
        objectiveSystem.run();

        // Should still be obj1 for stability
        assert.strictEqual(objectiveSystem.activeObjective, obj1);
    });
});
