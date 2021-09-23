interface Memory {
    colonies: {
        [colonyId: string]: Colony | undefined;
    };
}
