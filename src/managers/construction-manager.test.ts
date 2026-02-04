import { assert } from "chai";
import { Game, Memory } from "../../test/utils/mock";
import { loop } from "../main";

describe("Construction Manager", () => {
    beforeEach(() => {
        // @ts-ignore : allow adding Game to global
        global.Game = _.clone(Game);
        // @ts-ignore : allow adding Memory to global
        global.Memory = _.clone(Memory);
        loop();
    });

    it("should be defined", () => {
        // Placeholder for construction manager testing
        assert.isTrue(true);
    });
});
