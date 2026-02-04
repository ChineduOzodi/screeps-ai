import { assert } from "chai";
import { Game, Memory } from "../../test/utils/mock";
import { createFakeRoom } from "../../test/utils/fakes";
import { loop } from "../main";

describe("Room Prototype", () => {
    beforeEach(() => {
        // @ts-ignore : allow adding Game to global
        global.Game = _.clone(Game);
        // @ts-ignore : allow adding Memory to global
        global.Memory = _.clone(Memory);
        loop();
    });

    it("should exist", () => {
        const room = createFakeRoom("E1S1");
        assert.isDefined(room);
    });
});
