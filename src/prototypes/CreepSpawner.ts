import { BODYPART_COST_MAP } from "constants/creep-constants";
import { ColonyManager } from "./colony";
import { CreepProfiles } from "./creep";

export interface CreepSpawner {
    createProfiles(energyCap: number, colony: ColonyManager): CreepProfiles;
}

export abstract class CreepSpawnerImpl implements CreepSpawner {
    public createProfiles(energyRateCap: number, colony: ColonyManager): CreepProfiles {
        const profiles = this.onCreateProfiles(energyRateCap, colony);
        for (const name in profiles) {
            const profile = profiles[name];
            profile.spawnCostPerTick = this.getSpawnProfileEnergyCostPerTick(profile);
            if (profile.memoryBlueprint) {
                profile.memoryBlueprint.spawnCost = this.getSpawnProfileEnergyCost(profile);
            }
        }
        return profiles;
    }

    protected abstract onCreateProfiles(energyRateCap: number, colony: ColonyManager): CreepProfiles;

    /** Gets energy cost to produce and maintain per tick. Cost is returned as a positive number. */
    protected getSpawnProfileEnergyCostPerTick(profile: CreepSpawnerProfileInfo): number {
        const { bodyBlueprint } = profile;
        if (!bodyBlueprint) {
            return 0;
        }
        const cost = this.getSpawnProfileEnergyCost(profile);
        if (bodyBlueprint.includes(CLAIM)) {
            return cost / CREEP_CLAIM_LIFE_TIME;
        }
        return cost / CREEP_LIFE_TIME;
    }

    protected getSpawnProfileEnergyCost(profile: CreepSpawnerProfileInfo): number {
        const { bodyBlueprint } = profile;
        if (!bodyBlueprint) {
            return 0;
        }
        return CreepSpawnerImpl.getSpawnBodyEnergyCost(bodyBlueprint);
    }

    public static getSpawnBodyEnergyCostPerTick(body: BodyPartConstant[]) {
        const cost = this.getSpawnBodyEnergyCost(body);
        if (body.includes(CLAIM)) {
            return cost / CREEP_CLAIM_LIFE_TIME;
        }
        return cost / CREEP_LIFE_TIME;
    }

    public static getSpawnBodyEnergyCost(body: BodyPartConstant[]) {
        let cost = 0;
        for (const part of body) {
            cost += BODYPART_COST_MAP[part];
        }
        return cost;
    }

    /**
     * Copies and multiples the parts in the body list to make a bigger version of a creep.
     * @param body origin body
     * @param multiple multiple. Should be 1 or greater.
     * @returns new copy of body with parts multiplied.
     */
    public static multiplyBody(body: BodyPartConstant[], multiple: number): BodyPartConstant[] {
        if (multiple <= 0) {
            return body;
        }

        const newBody: BodyPartConstant[] = [];

        for (let i = 0; i < multiple; i++) {
            for (const part of body) {
                newBody.push(part);
            }
        }

        return newBody;
    }
}
