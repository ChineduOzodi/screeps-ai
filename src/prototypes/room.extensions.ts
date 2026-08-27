interface RoomMemory {
    positionReservations: RoomPositionReservations;
    constructionProjects: Record<string, ConstructionProject>;
    repairStats?: {
        totalNeeded: number;
        maintenanceHits: number;
        fortificationHits: number;
        emergencyHits: number;
        lastCheck: number;
    };
    extensionPlan?: ExtensionPlanMemory;
    corePlan?: CorePlanMemory;
}

interface CorePlanMemory {
    /** Spawn the core was laid out around. */
    spawnId: Id<StructureSpawn>;
    /** Tick the plan was computed, so a cramped room doesn't replan every pass. */
    plannedAt: number;
    plan: {
        storage?: { x: number; y: number };
        terminal?: { x: number; y: number };
        link?: { x: number; y: number };
        factory?: { x: number; y: number };
        observer?: { x: number; y: number };
        towers: { x: number; y: number }[];
        /** The lab cluster; the first two are the reaction input labs. */
        labs: { x: number; y: number }[];
    };
}

interface ExtensionPlanMemory {
    /** Spawn the extension field was anchored on. */
    spawnId: Id<StructureSpawn>;
    /** Tick the plan was computed, so a cramped room doesn't replan every pass. */
    plannedAt: number;
    /** Extension tiles in build order, closest to the spawn first. */
    extensions: { x: number; y: number }[];
    /** Walkway tiles worth paving once the extensions around them exist. */
    roads: { x: number; y: number }[];
}

interface ConstructionProject {
    name: string;
    structures: ProjectStructure[];
    status: "planning" | "building" | "complete";
}

interface ProjectStructure {
    x: number;
    y: number;
    roomName: string;
    type: StructureConstant;
}

interface RoomPositionReservations {
    [position: string]: PositionReservations;
}

interface PositionReservations {
    pos: RoomPosition | PathStep;
    reservations: PositionReservationData[];
}

interface PositionReservationData {
    creepName: string;
    startTime: number;
    endTime: number;
    role: string;
}
