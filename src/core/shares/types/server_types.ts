import { GameCharacterExtensions } from 'core/game/game_props';
import { HostConfigProps } from 'core/game/host.config';

export const enum LobbySocketEvent {
  QueryRoomList = 'room-list',
  SocketConfig = 'config',
}

export type RoomInfo = {
  name: string;
  activePlayers: number;
  totalPlayers: number;
  status: 'playing' | 'waiting';
  packages: GameCharacterExtensions[];
};

export type LobbySocketEventPicker<
  E extends LobbySocketEvent
> = E extends LobbySocketEvent.QueryRoomList
  ? RoomInfo[]
  : E extends LobbySocketEvent.SocketConfig
  ? HostConfigProps
  : never;