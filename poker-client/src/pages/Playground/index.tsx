import { useState } from 'react';

import Card from 'components/Card';

import AvatarImg from "assets/image/avatar.png";
import './style.scss';
import { useSelector } from 'store';
import { Player, PlayStatus } from 'utils/types';
import PlayerItem from 'components/Player';
import NumericInput from 'react-numeric-input';
import { allIn, call, check, fold, raise } from 'utils/socket';

// import { useNavigate } from 'react-router';

const Playground = () => {
    const { currentRoom } = useSelector((state) => state.currentRoom);
    const { player } = useSelector((state) => state.player);
    const [raiseAmount, setRaiseAmount] = useState(10);

    // const navigate = useNavigate();

    const handleCallBtn = () => {
        if (!currentRoom) return;
        call(currentRoom.id);
    }

    const handleRaiseBtn = () => {
        if (!currentRoom) return;
        raise(currentRoom.id, raiseAmount);
    }

    const handleAllInBtn = () => {
        if (!currentRoom) return;
        allIn(currentRoom.id);
    }

    const handleCheckBtn = () => {
        if (!currentRoom) return;
        check(currentRoom.id);
    }

    const handleFoldBtn = () => {
        if (!currentRoom) return;
        fold(currentRoom.id);
    }

    return (
        <div className="playground">
            {currentRoom && player &&
                <>
                    {currentRoom.players.map((otherPlayer: Player, index: number) => (
                        <div key={otherPlayer.id}>
                            {otherPlayer.playerStatus &&
                                <>
                                    <div className={`player-${index + 1} busted-${otherPlayer.playerStatus.status === PlayStatus.BUST}`}>
                                        {/* {otherPlayer.playerStatus && otherPlayer.playerStatus.status === PlayStatus.FOLD && <p>Folded</p>} */}
                                        {/* {index === currentRoom.gameStatus?.playTurn && <p>Turn</p>} */}
                                        {(otherPlayer.playerStatus && otherPlayer.playerStatus.handType) &&
                                            <div className="winner-text">
                                                <p>{otherPlayer.playerStatus.handType + " " + otherPlayer.playerStatus.winAmount}</p>
                                            </div>
                                        }
                                        <PlayerItem avatar={AvatarImg} username={otherPlayer.name} balance={otherPlayer.balance} />
                                        {
                                            (index === currentRoom.gameStatus?.playTurn && player.id === otherPlayer.id && player.playerStatus && !currentRoom.gameStatus.roundFinished) &&
                                            <div className={`flex btn-ctrl-bar player-${index + 1}`}>
                                                <div className='flex btn-ctrls'>
                                                    {player.playerStatus.subTotalBetAmount === currentRoom.gameStatus.currentBetAmount ?
                                                        <div className="btn-ctrl" onClick={handleCheckBtn}>
                                                            <p>Check</p>
                                                        </div> :
                                                        <div className="btn-ctrl" onClick={handleCallBtn}>
                                                            <p>Call({currentRoom.gameStatus.currentBetAmount - player.playerStatus.subTotalBetAmount})</p>
                                                        </div>
                                                    }
                                                    <div className="btn-ctrl" onClick={handleRaiseBtn}>
                                                        <p>Raise</p>
                                                    </div>

                                                    <div className="btn-ctrl" onClick={handleAllInBtn}>
                                                        <p>All-In</p>
                                                    </div>

                                                    <div className="btn-ctrl" onClick={handleFoldBtn}>
                                                        <p>Fold</p>
                                                    </div>
                                                </div>
                                                <NumericInput step={5} value={raiseAmount} onChange={(value: number | null, stringValue: string, input: HTMLInputElement) => { if (value !== null) setRaiseAmount(value) }} />
                                            </div>
                                        }
                                    </div>


                                    <div className={`card-${index + 1} flex`}>
                                        {player.id === otherPlayer.id ?
                                            <>
                                                {player.playerStatus && player.playerStatus.deck.map((cardValue) => (
                                                    <div className="card-item" key={"player-card" + cardValue}>
                                                        <Card cardValue={cardValue} isShow />
                                                    </div>
                                                ))
                                                }
                                                {index === currentRoom.gameStatus?.blindTurn &&
                                                    <div className="blind-stone">
                                                        <div className="content">
                                                            <p>Blind</p>
                                                        </div>
                                                    </div>
                                                }
                                                {!!otherPlayer.playerStatus &&
                                                    <div className='bet-amount'>
                                                        <div className='content'>
                                                            <p>{otherPlayer.playerStatus.totalBetAmout + otherPlayer.playerStatus.subTotalBetAmount}</p>
                                                        </div>
                                                    </div>
                                                }

                                            </> :
                                            <>
                                                {!otherPlayer.playerStatus.deck ?
                                                    <>
                                                        <div className="card-item">
                                                            <Card />
                                                        </div>
                                                        <div className="card-item">
                                                            <Card />
                                                        </div>
                                                    </> :
                                                    <>
                                                        {
                                                            otherPlayer.playerStatus.deck.map((cardValue) => (
                                                                <div className="card-item" key={"player-card" + cardValue}>
                                                                    <Card cardValue={cardValue} isShow />
                                                                </div>
                                                            ))
                                                        }
                                                    </>
                                                }
                                                {!!otherPlayer.playerStatus &&
                                                    <div className='bet-amount'>
                                                        <div className='content'>
                                                            <p>{otherPlayer.playerStatus.totalBetAmout + otherPlayer.playerStatus.subTotalBetAmount}</p>
                                                        </div>
                                                    </div>
                                                }
                                            </>
                                        }
                                    </div>
                                </>

                            }
                        </div>
                    ))}
                    <div className="flex background-cards">
                        {currentRoom.gameStatus && ([...currentRoom.gameStatus.deck, ...[-1, -1, -1, -1, -1]].slice(0, 5)).map((cardValue, index) => (
                            <div className="background-cards-item" key={"card-" + index}>
                                <Card cardValue={cardValue} isShow={cardValue !== -1} />
                            </div>
                        ))}
                        {currentRoom.started && currentRoom.gameStatus &&
                            <div className="pot-field">
                                <div className="content">
                                    <div>
                                        Pot: {currentRoom.gameStatus.pot}
                                    </div>
                                    <div>
                                        Round: {currentRoom.gameStatus.round}
                                    </div>
                                </div>
                            </div>
                        }
                    </div>
                </>
            }
        </div >
    );
}

export default Playground;