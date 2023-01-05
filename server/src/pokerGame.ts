import { Socket } from "socket.io";
import { GameStatus, Player, PlayerStatus, PlayStatus, Room } from "./types";
import { v4 as uuidV4 } from 'uuid';
import { PLAYER_WAIT_TIME, ROUND_WAIT_TIME } from "./constants";

const Hand = require("pokersolver").Hand;

function rand(limit: number) {
    return Math.floor(Math.random() * limit)
}

function getIndex(sockets: Socket[], id: string) {
    return sockets.map((socket: Socket) => socket.id).indexOf(id);
}

function getPlayerIndex(players: Player[], id: string) {
    return players.map(player => player.id).indexOf(id);
}

function getRoom(rooms: Room[], id: string) {
    const index = rooms.map(room => room.id).indexOf(id);
    return rooms[index];
}

function cutPlayers(room: Room): Room {
    const { players, ...rest } = room;
    return { ...rest } as Room;
}

function cutGameStatus(room: Room): Room {
    const { gameStatus, ...rest } = room;
    return { ...rest };
}

function cutPlayersCards(room: Room): Room {
    const { players, ...rest } = room;

    return {
        ...rest,
        players: players.map(player => {
            const { playerStatus, ...rest } = player;
            if (!playerStatus) return player;

            const { deck, ...restStatus } = playerStatus;
            return { playerStatus: { ...restStatus }, ...rest } as Player;
        })
    }
}

function cutRoomCards(room: Room): Room {
    const { gameStatus, ...rest } = room;
    if (!gameStatus?.cards) return room;
    const { cards, ...restStatus } = gameStatus;
    return { gameStatus: { ...restStatus }, ...rest };
}

const cards: number[] = [];
for (let i = 0; i < 52; i++) cards[i] = i;

function shuffleCards(cards: number[]) {
    const newCards = [...cards];
    for (let i = 0; i < 1000; i++) {
        let location1 = rand(cards.length);
        let location2 = rand(cards.length);
        let tmp = newCards[location1];
        newCards[location1] = newCards[location2];
        newCards[location2] = tmp;
    }
    return newCards;
}

const nextTurn = (room: Room, turn?: number) => {
    const { gameStatus } = room;
    if (!gameStatus) return 0;
    if (!turn) turn = gameStatus.playTurn;
    while (true) {
        turn = (turn + 1) % room.numberOfPlayers;
        const player = room.players[turn];
        const { playerStatus } = player;
        if (!playerStatus) break;
        if (playerStatus.status !== PlayStatus.FOLD && playerStatus.status !== PlayStatus.BUST && playerStatus.status !== PlayStatus.ALLIN) break;
    }
    return turn;
}

const prevTurn = (room: Room, turn?: number) => {
    const { gameStatus } = room;
    if (!gameStatus) return 0;
    if (!turn) turn = gameStatus.playTurn;
    while (true) {
        turn = (turn - 1 + room.numberOfPlayers) % room.numberOfPlayers;
        const player = room.players[turn];
        const { playerStatus } = player;
        if (!playerStatus) break;
        if (playerStatus.status !== PlayStatus.FOLD && playerStatus.status !== PlayStatus.BUST && playerStatus.status !== PlayStatus.ALLIN) break;
    }
    return turn;
}

const cardString = (cardval: number) => {
    const suit = ["d", "c", "h", "s"][Math.floor(cardval / 13)];
    cardval %= 13;
    let val = `${cardval + 2}`;
    switch (cardval) {
        case 8: val = 'T'; break;
        case 9: val = 'J'; break;
        case 10: val = 'Q'; break;
        case 11: val = 'K'; break;
        case 12: val = 'A'; break;
    }
    return val + suit;
}

export default class PokerGame {
    private sockets: Socket[];
    private players: Player[];
    private rooms: Room[];
    constructor() {
        this.sockets = [];
        this.players = [];
        this.rooms = [];
    }

    public joinGame(socket: Socket, { name }: { name: string }): void {
        const playerId = uuidV4();
        const player: Player = { id: playerId, name, balance: 2000 };
        this.players.push(player);
        this.sockets.push(socket);

        socket.emit("joinedGame", {
            player,
            rooms: this.rooms.map(room => cutPlayers(room))
        });
    }

    public leaveGame(socket: Socket): void {
        this.leaveRoom(socket);
        const index = getIndex(this.sockets, socket.id);
        const player = this.players[index];
        if (!player) return;
        this.rooms.forEach((room) => {
            if (room.creator.id === player.id) {
                this.closeRoom({ roomId: room.id });
            }
        })
        this.sockets.splice(index, 1);
        this.players.splice(index, 1);
    }

    public createRoom(socket: Socket, { name }: { name: string }): void {
        const roomId = uuidV4();
        const index = getIndex(this.sockets, socket.id);
        const player = this.players[index];
        const room: Room = {
            id: roomId,
            name,
            creator: player,
            started: false,
            numberOfPlayers: 1,
            players: [player]
        };
        this.rooms.push(room);

        this.sockets.forEach((client: Socket) => {
            client.emit("createdRoom", { room: client.id === socket.id ? room : cutPlayers(room) });
        })
    }

    public joinRoom(socket: Socket, { roomId }: { roomId: string }): void {
        const index = getIndex(this.sockets, socket.id);
        const newPlayer = this.players[index];
        const room = getRoom(this.rooms, roomId);
        if (room.numberOfPlayers >= 10) {
            return;
        }
        if (room.players.map(player => player.id).indexOf(newPlayer.id) !== -1) {
            return;
        }

        newPlayer.roomId = roomId;
        room.numberOfPlayers++;
        room.players.push(newPlayer);

        this.players.forEach((player) => {
            const index = getPlayerIndex(this.players, player.id);
            const socket = this.sockets[index];
            if (getPlayerIndex(room.players, player.id) === -1) {
                socket.emit("updatedRoom", { room: cutPlayers(room) });
            } else {
                socket.emit("joinedPlayer", { room });
            }
        })
    }

    public leaveRoom(socket: Socket): void {
        const index = getIndex(this.sockets, socket.id);
        const leftPlayer = this.players[index];
        if (!leftPlayer || !leftPlayer.roomId) return;
        const room = getRoom(this.rooms, leftPlayer.roomId);
        console.log(room);
        if (!room) return;

        room.numberOfPlayers--;
        room.players = room.players.filter(player => player.id !== leftPlayer.id);

        this.players.forEach((player) => {
            const index = getPlayerIndex(this.players, player.id);
            const socket = this.sockets[index];
            if (getPlayerIndex(room.players, player.id) === -1) {
                socket.emit("updatedRoom", { room: cutPlayers(room) });
            } else {
                socket.emit("leftPlayer", { room });
            }
        })
    }

    public closeRoom({ roomId }: { roomId: string }): void {
        this.rooms = this.rooms.filter(room => room.id !== roomId);
        this.players.forEach((player) => {
            const index = getPlayerIndex(this.players, player.id);
            const socket = this.sockets[index];
            socket.emit("closedRoom", { roomId });
        })
    }

    startNewRound = (room: Room) => {
        const shuffledCards = shuffleCards(cards);
        let blindTurn = rand(room.numberOfPlayers);
        if (room.gameStatus) {
            blindTurn = nextTurn(room, room.gameStatus.blindTurn);
        }
        const gameStatus: GameStatus = {
            round: 1,
            roundFinished: false,
            currentBetAmount: 0,
            pot: 0,
            blindTurn,
            playTurn: blindTurn,
            deck: [],
            cards: shuffledCards,
            timestamp: 0,
        };

        if (room.gameStatus) {
            gameStatus.round = room.gameStatus.round + 1;
        }

        room.gameStatus = gameStatus;

        room.players.forEach((player, index) => {
            const playerStatus: PlayerStatus = {
                totalBetAmout: 0,
                subTotalBetAmount: 0,
                status: PlayStatus.NONE,
                deck: [
                    shuffledCards[index * 2],
                    shuffledCards[index * 2 + 1]
                ],
                winAmount: 0,
            };
            player.playerStatus = playerStatus;
        })

        room.players.forEach((player, index) => {
            const { playerStatus } = player;
            if (playerStatus && (index === blindTurn || index === prevTurn(room, blindTurn))) {
                let amount = index === blindTurn ? 10 : 5;
                if (gameStatus.currentBetAmount < amount) gameStatus.currentBetAmount = amount;
                if (player.balance >= amount) {
                    playerStatus.subTotalBetAmount = amount;
                    player.balance -= amount;
                    gameStatus.pot += amount;
                } else {
                    playerStatus.status = PlayStatus.BUST;
                }
            }
        });
        gameStatus.playTurn = nextTurn(room, blindTurn);
        gameStatus.timestamp = new Date().getTime();

        setTimeout(() => {
            const { gameStatus } = room;
            if (gameStatus && new Date().getTime() - gameStatus.timestamp >= PLAYER_WAIT_TIME) {
                const player = room.players[gameStatus.playTurn];
                if (!player) return;
                const { playerStatus } = player;
                if (!playerStatus) return;
                const playerIndex = getPlayerIndex(this.players, player.id);
                const socket = this.sockets[playerIndex];
                this.updateGameStatus(socket, { roomId: room.id, status: PlayStatus.FOLD });
            }
        }, PLAYER_WAIT_TIME);
    }

    public startRoomGame({ roomId }: { roomId: string }): void {
        const room = getRoom(this.rooms, roomId);
        room.started = true;
        this.startNewRound(room);

        this.players.forEach((player) => {
            const index = getPlayerIndex(this.players, player.id);
            const socket = this.sockets[index];
            const playerIndex = getPlayerIndex(room.players, player.id);
            if (playerIndex === -1) {
                socket.emit("updatedRoom", { room: cutPlayers(cutGameStatus(room)) });
            } else {
                socket.emit("updatedGameStatus", { room: cutPlayersCards(cutRoomCards(room)), player: room.players[playerIndex] });
            }
        })
    }

    checkWinning = (room: Room) => {
        // check winners
        const hands: any[] = [];
        const { gameStatus } = room;
        if (!gameStatus) return;
        room.players.forEach(player => {
            const { playerStatus } = player;
            if (playerStatus && playerStatus.status !== PlayStatus.BUST && playerStatus.status !== PlayStatus.FOLD) {
                const deck = [...playerStatus?.deck, ...gameStatus.deck];
                hands.push(Hand.solve(deck.map(cardval => cardString(cardval))));
            } else {
                hands.push(null);
            }
        });
        console.log(hands.length);
        let subHands = hands.filter(hand => hand);
        while (gameStatus.pot) {
            if (!subHands.length) break;
            const winners = Hand.winners(subHands);
            subHands = subHands.filter(hand => !winners.includes(hand));
            winners.forEach((winner: any, index: number) => {
                const playerIndex = hands.indexOf(winner);
                const player = room.players[playerIndex];
                const { playerStatus } = player;
                if (playerStatus) {
                    const totalBetAmout = playerStatus.totalBetAmout;
                    let maxWinAmount = totalBetAmout;
                    const remainingIndexes = subHands.map(hand => hands.indexOf(hand));
                    console.log(remainingIndexes);
                    room.players.forEach((player, index) => {
                        const { playerStatus } = player;
                        if (playerStatus && (remainingIndexes.includes(index) || playerStatus.status === PlayStatus.BUST || playerStatus.status === PlayStatus.FOLD)) {
                            maxWinAmount += Math.min(totalBetAmout, playerStatus.totalBetAmout);
                        }
                    });
                    const winAmount = Math.min(maxWinAmount, Math.floor(gameStatus.pot / (winners.length - index)));
                    console.log(gameStatus.pot, winners.length - index, maxWinAmount);
                    playerStatus.winAmount += winAmount;
                    gameStatus.pot -= winAmount;
                    player.balance += winAmount;
                    playerStatus.handType = winner.name;
                }
            });
        }

        gameStatus.roundFinished = true;

        room.players.forEach((player) => {
            const playerId = getPlayerIndex(this.players, player.id);
            const socket = this.sockets[playerId];
            socket.emit("updatedGameStatus", { room, player });
        });

        // start new round after 10 seconds
        setTimeout(() => {
            this.startNewRound(room);
            room.players.forEach((player) => {

                const playerId = getPlayerIndex(this.players, player.id);
                const socket = this.sockets[playerId];
                socket.emit("updatedGameStatus", { room: cutPlayersCards(cutRoomCards(room)), player });
            });
        }, ROUND_WAIT_TIME);
    }

    dealCards = (room: Room) => {
        const { gameStatus } = room;
        if (!gameStatus || !gameStatus.cards) return false;

        room.players.forEach(player => {
            const { playerStatus } = player;
            if (playerStatus) {
                playerStatus.totalBetAmout += playerStatus.subTotalBetAmount;
                playerStatus.subTotalBetAmount = 0;
            }
            gameStatus.currentBetAmount = 0;
        })

        gameStatus.playTurn = nextTurn(room, gameStatus.blindTurn);

        if (gameStatus.deck.length === 5) {
            this.checkWinning(room);
            return true;
        }
        if (!gameStatus.deck.length) {
            for (let i = 0; i < 3; i++) {
                gameStatus.deck[i] = gameStatus.cards[51 - i];
            }
        } else {
            gameStatus.deck.push(gameStatus.cards[51 - gameStatus.deck.length]);
        }
        return false;
    }

    public updateGameStatus(socket: Socket, { roomId, status, amount }: { roomId: string, status: PlayStatus, amount?: number }): void {
        if (!socket) return;
        const index = getIndex(this.sockets, socket.id);
        let player = this.players[index];
        const room = getRoom(this.rooms, roomId);
        if (!room || !room.gameStatus) return;

        const gameStatus = room.gameStatus;
        const playerIndex = room.players.map(player => player.id).indexOf(player.id);
        if (playerIndex === -1 || playerIndex !== gameStatus.playTurn || !gameStatus.cards) {
            return;
        }

        player = room.players[playerIndex];
        const playerStatus = player.playerStatus;
        if (!playerStatus) return;
        playerStatus.status = status;

        let dealCardsFlag = false;
        if (status === PlayStatus.CALL) {
            let betAmount = gameStatus.currentBetAmount - playerStatus.subTotalBetAmount;
            if (player.balance < betAmount) {
                betAmount = player.balance;
                playerStatus.status = PlayStatus.ALLIN;
            }
            player.balance -= betAmount;
            playerStatus.subTotalBetAmount += betAmount;
            gameStatus.pot += betAmount;

            gameStatus.playTurn = nextTurn(room);
            let nextPlayer = room.players[gameStatus.playTurn];
            if (nextPlayer.playerStatus?.subTotalBetAmount === gameStatus.currentBetAmount) {
                dealCardsFlag = this.dealCards(room);
            }
        } else if (status === PlayStatus.RAISE && amount) {
            let betAmount = gameStatus.currentBetAmount + amount - playerStatus.subTotalBetAmount;
            if (player.balance < betAmount) {
                return;
            }
            player.balance -= betAmount;
            gameStatus.currentBetAmount += amount;
            playerStatus.subTotalBetAmount += betAmount
            gameStatus.pot += betAmount;

            gameStatus.playTurn = nextTurn(room);
        } else if (status === PlayStatus.CHECK) {
            if (nextTurn(room) === nextTurn(room, gameStatus.blindTurn)) {
                dealCardsFlag = this.dealCards(room);
            } else {
                gameStatus.playTurn = nextTurn(room);
            }
        } else if (status === PlayStatus.FOLD) {
            playerStatus.status = PlayStatus.FOLD;
            gameStatus.playTurn = nextTurn(room);

            let nextPlayer = room.players[gameStatus.playTurn];
            if (nextPlayer.playerStatus?.subTotalBetAmount === gameStatus.currentBetAmount) {
                dealCardsFlag = this.dealCards(room);
            }

            let activePlayers = 0;
            room.players.forEach((player) => {
                const { playerStatus } = player;
                if (playerStatus &&
                    playerStatus.status !== PlayStatus.FOLD &&
                    playerStatus.status !== PlayStatus.BUST &&
                    playerStatus.status !== PlayStatus.ALLIN
                ) {
                    activePlayers++;
                }
            });

            if (activePlayers === 1) {
                while (!this.dealCards(room));
            }
        } else if (status === PlayStatus.ALLIN) {
            playerStatus.status = PlayStatus.ALLIN;
            playerStatus.subTotalBetAmount += player.balance;
            if (gameStatus.currentBetAmount < playerStatus.subTotalBetAmount) {
                gameStatus.currentBetAmount = playerStatus.subTotalBetAmount;
            }
            gameStatus.pot += player.balance;
            player.balance = 0;
            gameStatus.playTurn = nextTurn(room);
        }

        room.gameStatus.timestamp = new Date().getTime();

        if (dealCardsFlag) return;

        room.players.forEach((player) => {
            const index = getPlayerIndex(this.players, player.id);
            const socket = this.sockets[index];
            socket.emit("updatedGameStatus", { room: cutPlayersCards(cutRoomCards(room)), player });
        });
        

        setTimeout(() => {
            const { gameStatus } = room;
            if (gameStatus && new Date().getTime() - gameStatus.timestamp >= PLAYER_WAIT_TIME) {
                const player = room.players[gameStatus.playTurn];
                if (!player) return;
                const { playerStatus } = player;
                if (!playerStatus) return;
                const playerIndex = getPlayerIndex(this.players, player.id);
                const socket = this.sockets[playerIndex];
                if (playerStatus.subTotalBetAmount === gameStatus.currentBetAmount) {
                    this.updateGameStatus(socket, { roomId: room.id, status: PlayStatus.CHECK });
                } else {
                    this.updateGameStatus(socket, { roomId: room.id, status: PlayStatus.FOLD });
                }
            }
        }, PLAYER_WAIT_TIME);
    }

    public test() {
        const players: Player[] = [];
        const shuffledCards = shuffleCards(cards);
        const betAmounts = [20, 80, 50, 40];
        const folds = [false, false, true, false];
        let pot = 0;
        for (let i = 0; i < 4; i++) {
            pot += betAmounts[i];
            players.push({
                id: uuidV4(),
                name: `player ${i}`,
                balance: 1000,
                playerStatus: {
                    totalBetAmout: betAmounts[i],
                    subTotalBetAmount: 0,
                    status: folds[i] ? PlayStatus.FOLD : PlayStatus.CALL,
                    deck: shuffledCards.slice(i * 2, i * 2 + 2),
                    winAmount: 0,
                }
            })
        };

        const room: Room = {
            id: uuidV4(),
            name: 'test',
            creator: players[0],
            started: true,
            numberOfPlayers: 4,
            players,
            gameStatus: {
                round: 0,
                roundFinished: false,
                currentBetAmount: 30,
                pot,
                blindTurn: 0,
                playTurn: 0,
                deck: shuffledCards.slice(-5),
                timestamp: 0,
            }
        }


        console.log(room.gameStatus);
        this.checkWinning(room);
        console.log(room.gameStatus);

        for (let i = 0; i < 4; i++) {
            console.log(players[i]);
        }
    }
}

// const hand1 = Hand.solve([
//     '5s', '7c',
//     '6d', '2d',
//     '8c', '3h',
//     '2s'
//   ]);
// const hand2 = Hand.solve([
//     'Qc', '7s',
//     '6d', '2d',
//     '8c', '3h',
//     '2s'
//   ]);
// const hand3 = Hand.solve([
//     '4s', 'Qh',
//     '6d', '2d',
//     '8c', '3h',
//     '2s'
//   ]);
// const hands = [hand1, hand2, hand3];
// const winners = Hand.winners(hands);

// console.log(winners.map((winner: { name: any; }) => winner.name + " " + hands.indexOf(winner)));