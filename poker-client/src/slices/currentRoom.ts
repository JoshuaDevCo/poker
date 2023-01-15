import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Room } from 'utils/types';

interface CurrentRoomState {
    currentRoom: Room | null;
    logs: string [];
}

const initialState: CurrentRoomState = {
    currentRoom: null,
    logs: []
};

const slice = createSlice({
    name: 'currentRoom',
    initialState,
    reducers: {
        setCurrentRoom(state: CurrentRoomState, action: PayloadAction<{ room: Room }>) {
            const { room } = action.payload;
            state.currentRoom = room;
        },
        closedCurrentRoom(state: CurrentRoomState) {
            state.currentRoom = null;
        },
        setLogs(state: CurrentRoomState, action: PayloadAction<{ logs: string[] }>) {
            const { logs } = action.payload;
            state.logs = logs;
        }
    }
});

export const reducer = slice.reducer;

export const { setCurrentRoom, closedCurrentRoom, setLogs } = slice.actions;

export default slice;
