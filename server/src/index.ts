import SocketIO from "socket.io";
import http from 'http';
import express from 'express';
import path from "path";
import cors from 'cors';
import PokerGame from "./pokerGame";

const port: number = 4000

class App {
    private server: http.Server;
    private port: number;
    private io: SocketIO.Server;
    private game: PokerGame;

    constructor(port: number) {
        this.port = port;
        
        const app = express();
        app.use(cors());
        app.use(express.static(path.join(__dirname, '../../client/build')));
        // app.get('/test', (req: Request, res: Response) => {
        //     console.log('test works');
        //     res.json("Success");
        // })

        this.server = new http.Server(app);
        this.io = new SocketIO.Server(this.server, {
            cors: {
                origin: "http://localhost:3000",
                methods: ["GET", "POST"]
            }
        });

        this.game = new PokerGame();
        
        this.io.on('connection', (socket: SocketIO.Socket) => {
            // console.log('a user connected', socket.id);
            socket.on('joinGame', (data) => this.game.joinGame(socket, data));

            socket.on('createRoom', (data) => this.game.createRoom(socket, data));

            socket.on('joinRoom', (data) => this.game.joinRoom(socket, data));

            socket.on('leaveRoom', () => this.game.leaveRoom(socket));

            socket.on("closeRoom", (data) => this.game.closeRoom(data));

            socket.on("startRoomGame", (data) => this.game.startRoomGame(data));

            socket.on("updateGameStatus", (data) => this.game.updateGameStatus(socket, data));
            
            socket.on('disconnect', () => {
                this.game.leaveGame(socket);
            })
        })

    }

    public start() {
        this.server.listen(this.port);
        console.log(`Server listening on port ${this.port}`);
    }
}

new App(port).start();