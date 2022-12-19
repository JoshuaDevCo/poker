import { Socket } from "socket.io";
import { GameStatus, Player, PlayerStatus, PlayStatus, Room } from "./types";
import { v4 as uuidV4 } from 'uuid';

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
    const { players, gameStatus, ...rest } = room;
    let securedStatus: GameStatus | undefined = gameStatus ? { ...gameStatus } : undefined;
    if (securedStatus) {
        securedStatus.cards = undefined;
    }
    
    return {
        ...rest,
        gameStatus: securedStatus,
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
    if (!gameStatus) return;
    if (turn) gameStatus.playTurn = turn;
    while (true) {
        gameStatus.playTurn = (gameStatus.playTurn + 1) % room.numberOfPlayers;
        const player = room.players[gameStatus.playTurn];
        const { playerStatus } = player;
        if (playerStatus?.status !== PlayStatus.FOLD && playerStatus?.status !== PlayStatus.BUST) break;
    }
}

const prevTurn = (turn: number, room: Room) => {
    const { gameStatus } = room;
    if (!gameStatus) return;
    while (true) {
        turn = (turn - 1 + room.numberOfPlayers) % room.numberOfPlayers;
        const player = room.players[turn];
        const { playerStatus } = player;
        if (playerStatus?.status !== PlayStatus.FOLD && playerStatus?.status !== PlayStatus.BUST) break;
    }
    return turn;
}

const cardString = (cardval: number) => {
    const suit = ["d", "c", "h", "s"][Math.floor(cardval / 13)];
    cardval %= 13;
    let val = `${cardval + 2}`;
    switch (cardval) {
        case 8:  val = 'T'; break;
        case 9:  val = 'J'; break;
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
            blindTurn = room.gameStatus.blindTurn + 1;
        }
        const gameStatus: GameStatus = {
            round: 1,
            roundFinished: false,
            currentBetAmount: 0,
            pot: 0,
            blindTurn,
            playTurn: blindTurn,
            deck: [],
            cards: shuffledCards
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
            }
            if (index === blindTurn || index === prevTurn(blindTurn, room)) {
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

            player.playerStatus = playerStatus;
        });
        nextTurn(room, blindTurn);
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
            if (playerStatus) {
                if (playerStatus.status !== PlayStatus.BUST && playerStatus.status !== PlayStatus.FOLD) {
                    const deck = [...playerStatus?.deck, ...gameStatus.deck];
                    hands.push(Hand.solve(deck.map(cardval => cardString(cardval))));
                    console.log(deck.map(cardval => cardString(cardval)));
                } 
            } else {
                hands.push(null);
            }
        });

        let subHands = hands.filter(hand => hand);
        while (gameStatus.pot) {
            const winners = Hand.winners(subHands);
            subHands = subHands.filter(hand => winners.indexOf(hand) === -1);
            winners.forEach((winner: any) => {
                const playerIndex = hands.indexOf(winner);
                const player = room.players[playerIndex];
                const { playerStatus } = player;
                if (playerStatus) {
                    const totalBetAmout = playerStatus.totalBetAmout;
                    let maxWinAmount = totalBetAmout;
                    const remainingIndexes = subHands.map(hand => hands.indexOf(hand));
                    room.players.forEach((player, index) => {
                        if (remainingIndexes.includes(index)) {
                            const { playerStatus } = player;
                            if (playerStatus) {
                                maxWinAmount += Math.min(totalBetAmout, playerStatus.totalBetAmout);
                            }
                        }
                    });
                    console.log(winners.length, winner.name);
                    const winAmount = Math.min(maxWinAmount, Math.floor(gameStatus.pot / winners.length));
                    playerStatus.winAmount +=  winAmount;
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

        setTimeout(() => {
            room.players.forEach((player) => {
                this.startNewRound(room);

                const playerId = getPlayerIndex(this.players, player.id);
                const socket = this.sockets[playerId];
                socket.emit("updatedGameStatus", { room: cutPlayersCards(room), player });
            }); 
        }, 10 * 1000);
    }
    
    dealCards = (room: Room) => {
        const { gameStatus } = room;
        if (!gameStatus || !gameStatus.cards) return false;
    
        if (gameStatus.deck.length === 5) {
            this.checkWinning(room);
            return true;
        }
        if (!gameStatus.deck.length) {
            for (let i = 0; i < 3; i++) {
                gameStatus.deck[i] = gameStatus.cards[room.numberOfPlayers * 2 + i];
            }
        } else {
            gameStatus.deck.push(gameStatus.cards[room.numberOfPlayers * 2 + gameStatus.deck.length]);
        }
        room.players.forEach(player => {
            const { playerStatus } = player;
            if (playerStatus) {
                playerStatus.totalBetAmout += playerStatus.subTotalBetAmount;
                playerStatus.subTotalBetAmount = 0;
            }
            gameStatus.currentBetAmount = 0;
        })
    
        gameStatus.playTurn = gameStatus.blindTurn;
        nextTurn(room);
        return false;
    }

    public updateGameStatus(socket: Socket, { roomId, status, amount }: { roomId: string, status: PlayStatus, amount?: number }): void {
        const index = getIndex(this.sockets, socket.id);
        let player = this.players[index];
        const room = getRoom(this.rooms, roomId);
        const gameStatus = room.gameStatus;
        const playerIndex = room.players.map(player => player.id).indexOf(player.id);
        if (!gameStatus || playerIndex === -1 || playerIndex !== gameStatus.playTurn || !gameStatus.cards) {
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

            nextTurn(room);
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

            nextTurn(room);
        } else if (status === PlayStatus.CHECK) {
            if (gameStatus.playTurn === gameStatus.blindTurn) {
                dealCardsFlag = this.dealCards(room);
            } else {
                nextTurn(room);
            }
        } else if (status === PlayStatus.FOLD) {
            playerStatus.status = PlayStatus.FOLD;
            nextTurn(room);
        }

        if (dealCardsFlag) return;

        room.players.forEach((player) => {
            const index = getPlayerIndex(this.players, player.id);
            const socket = this.sockets[index];
            socket.emit("updatedGameStatus", { room: cutPlayersCards(room), player });
        })
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