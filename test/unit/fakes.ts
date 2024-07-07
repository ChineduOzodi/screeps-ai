export function createFakeStructureSpawn(id: string, roomName: string): StructureSpawn {
  return {
    id,
    room: createFakeRoom(roomName),
    memory: {},
  } as any as StructureSpawn;
}

export function createFakeRoom(roomName: string): Room {
  return {
    name: roomName,
  } as any as Room;
}
