import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import confetti from 'canvas-confetti';

// --- CONFIGURATION ---
const socket = io('http://localhost:3000'); 

export default function App() {
  const [view, setView] = useState('LANDING'); 
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [gameState, setGameState] = useState(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [openLobbies, setOpenLobbies] = useState([]);

  // Settings State
  const [selectedDifficulties, setSelectedDifficulties] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [qCount, setQCount] = useState(10);
  const [questionDuration, setQuestionDuration] = useState(60);

  const CATEGORIES = [
    { id: '', name: 'Any Category' },
    { id: 9, name: 'General Knowledge' },
    { id: 11, name: 'Movies' },
    { id: 12, name: 'Music' },
    { id: 17, name: 'Science & Nature' },
    { id: 18, name: 'Computers' },
    { id: 21, name: 'Sports' },
    { id: 22, name: 'Geography' },
    { id: 23, name: 'History' },
  ];
  const DIFFICULTIES = [
    { id: 'easy', name: 'Easy' },
    { id: 'medium', name: 'Medium' },
    { id: 'hard', name: 'Hard' },
  ];

  useEffect(() => {
    socket.on('state_update', (state) => {
      setGameState(state);
      
      // View Router
      if (state.status === 'LOBBY' || state.status === 'LOADING') {
        setView('LOBBY');
      } else if (state.status === 'FINISHED') {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        setView('GAME');
      } else {
        setView('GAME');
      }
    });

    socket.on('open_lobbies', (lobbies) => setOpenLobbies(lobbies));
    socket.on('error', (err) => alert(err.message));
    socket.on('kicked', () => { alert("You have been kicked."); window.location.reload(); });

    return () => socket.off();
  }, []);

  // --- ACTIONS ---
  const createRoom = () => { if(!name.trim()) return alert("Nickname required"); socket.emit('create_room', { hostName: name }); };
  const joinRoom = (code = roomCode) => { 
    const normalized = code?.toString().trim();
    if(!name.trim() || !normalized) return alert("Info required"); 
    socket.emit('join_game', { roomCode: normalized.toUpperCase(), name }); 
  };
  const createTeam = (teamName) => { if(!teamName.trim()) return; socket.emit('create_team', { roomCode: gameState.code, teamName }); };
  const joinTeam = (teamId) => { socket.emit('join_team', { roomCode: gameState.code, teamId }); };
  const submitAnswer = (answerId) => { socket.emit('submit_answer', { roomCode: gameState.code, answerId }); };
  const adminAction = (action, payload = {}) => { socket.emit('host_action', { roomCode: gameState.code, action, payload }); };
  const refreshLobbies = () => socket.emit('list_lobbies');
  const goToMenu = () => { if(!name.trim()) return alert("Nickname required"); setView('MENU'); refreshLobbies(); };
  const startNextRound = () => adminAction('NEXT_ROUND');
  const endGame = () => adminAction('END_GAME');

  const iAmHost = gameState?.players[socket.id]?.isHost;
  const myPlayer = gameState?.players[socket.id];
  const myTeam = myPlayer?.teamId ? gameState?.teams[myPlayer.teamId] : null;
  const currentDuration = gameState?.config?.questionDurationSec || questionDuration || 60;
  const currentRound = gameState?.roundNumber || 1;
  const sortedTeams = gameState?.teams ? Object.values(gameState.teams).sort((a, b) => b.score - a.score) : [];

  // --- TIMER LOGIC ---
  useEffect(() => {
    if (gameState?.status === 'QUESTION' && gameState?.currentQuestionEndsAt) {
        const interval = setInterval(() => {
            const secondsRemaining = Math.max(0, Math.ceil((gameState.currentQuestionEndsAt - Date.now()) / 1000));
            setTimeLeft(secondsRemaining);
        }, 1000);
        return () => clearInterval(interval);
    } else {
        setTimeLeft(currentDuration);
    }
  }, [gameState?.status, gameState?.currentQuestionEndsAt, currentDuration]);

  useEffect(() => {
    if (view === 'MENU') {
        refreshLobbies();
        const interval = setInterval(refreshLobbies, 5000);
        return () => clearInterval(interval);
    }
  }, [view]);

  // --- COMPONENTS ---

  if (view === 'LANDING') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-brand-card p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full space-y-6">
          <h1 className="text-4xl font-black text-center text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">PUB QUIZ</h1>
          <input className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white" placeholder="Nickname" value={name} onChange={e => setName(e.target.value)}/>
          <button onClick={goToMenu} className="w-full bg-indigo-600 font-bold py-3 rounded-xl text-white">Continue</button>
        </div>
      </div>
    );
  }

  if (view === 'MENU') {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Welcome</div>
              <div className="text-3xl font-black">{name || 'Player'}</div>
            </div>
            <button onClick={createRoom} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg">Host New Lobby</button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
              <div>
                <div className="text-xs uppercase text-slate-500">Join by Code</div>
                <div className="text-lg font-semibold">Have a room code? Jump in.</div>
              </div>
              <div className="flex gap-2">
                <input className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono uppercase w-28 text-center" maxLength={4} placeholder="ABCD" value={roomCode} onChange={e => setRoomCode(e.target.value)} />
                <button onClick={() => joinRoom()} className="bg-green-500 text-slate-900 font-bold px-5 py-3 rounded-xl hover:bg-green-400">Join</button>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-500">
              <div>Live lobbies refresh every few seconds.</div>
              <button onClick={refreshLobbies} className="text-indigo-400 hover:text-indigo-300">Refresh now</button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Open Lobbies</h2>
              <span className="text-sm text-slate-400">{openLobbies.length} active</span>
            </div>
            {openLobbies.length === 0 ? (
              <div className="text-slate-500">No open lobbies right now. Start one and invite friends!</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {openLobbies.map(lobby => (
                  <div key={lobby.code} className="border border-slate-800 bg-slate-800 p-4 rounded-xl flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <div className="text-lg font-bold">Room {lobby.code}</div>
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-700 uppercase tracking-wide">{lobby.status}</span>
                    </div>
                    <div className="text-sm text-slate-400">Host: {lobby.hostName}</div>
                    <div className="flex gap-4 text-sm text-slate-400">
                      <span>Players: {lobby.playerCount}</span>
                      <span>Teams: {lobby.teamCount}</span>
                    </div>
                    <button onClick={() => joinRoom(lobby.code)} className="mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg">Join Lobby</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!gameState) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;

  if (gameState.status === 'LOADING') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-bold">Fetching Questions...</h2>
      </div>
    );
  }

  if (view === 'LOBBY') {
    return (
      <div className="min-h-screen p-6 max-w-5xl mx-auto pb-32">
        <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
           <div><div className="text-xs text-slate-500">CODE</div><div className="text-4xl font-mono font-bold text-white">{gameState.code}</div></div>
           <div className="text-right"><div className="text-xs text-slate-500">Players</div><div className="text-2xl font-mono text-white">{Object.keys(gameState.players).length}</div></div>
        </div>
        <div className="flex gap-2 mb-8">
           <input id="tInput" className="flex-1 bg-slate-800 border-slate-700 rounded-xl px-4 text-white" placeholder="New Team Name" />
           <button onClick={() => { const el=document.getElementById('tInput'); createTeam(el.value); el.value='' }} className="bg-indigo-600 px-6 py-3 rounded-xl font-bold text-white">Create</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           {Object.values(gameState.teams).map(t => (
             <div key={t.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700">
               <div className="flex justify-between"><h3 className="font-bold text-white">{t.name}</h3>{!t.members.includes(socket.id) && <button onClick={() => joinTeam(t.id)} className="text-xs bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full">Join</button>}</div>
               <div className="mt-2 text-sm text-slate-400">{t.members.map(mid => <span key={mid} className="mr-2">{gameState.players[mid]?.name}</span>)}</div>
             </div>
           ))}
        </div>
        {iAmHost && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 z-50">
            <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1">Question Count</label>
                  <input type="number" min={1} max={500} className="w-full bg-slate-800 text-white p-2 rounded border border-slate-700" value={qCount} onChange={e => setQCount(Math.max(1, Number(e.target.value) || 1))}/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1">Timer (seconds)</label>
                  <input type="number" min={5} max={600} className="w-full bg-slate-800 text-white p-2 rounded border border-slate-700" value={questionDuration} onChange={e => setQuestionDuration(Math.max(5, Number(e.target.value) || 5))}/>
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1">Categories (mix allowed)</label>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setSelectedCategories([])} className={`px-3 py-2 rounded text-sm border ${selectedCategories.length === 0 ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>Any</button>
                    {CATEGORIES.filter(c => c.id !== '').map(c => (
                      <button key={c.id} onClick={() => setSelectedCategories(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])} className={`px-3 py-2 rounded text-sm border ${selectedCategories.includes(c.id) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>{c.name}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1">Difficulties (mix allowed)</label>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setSelectedDifficulties([])} className={`px-3 py-2 rounded text-sm border ${selectedDifficulties.length === 0 ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>Any</button>
                    {DIFFICULTIES.map(d => (
                      <button key={d.id} onClick={() => setSelectedDifficulties(prev => prev.includes(d.id) ? prev.filter(id => id !== d.id) : [...prev, d.id])} className={`px-3 py-2 rounded text-sm border ${selectedDifficulties.includes(d.id) ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>{d.name}</button>
                    ))}
                  </div>
                </div>
            </div>
            <button onClick={() => adminAction('START_GAME', { amount: qCount, categories: selectedCategories, difficulties: selectedDifficulties, questionDurationSec: questionDuration })} className="w-full bg-brand-accent hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-xl">START GAME</button>
            </div>
        </div>
        )}
      </div>
    );
  }

  // GAME VIEW
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 pb-24">
      <div className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-20 shadow-xl">
         <div className="flex justify-between items-center max-w-4xl mx-auto">
            <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${gameState.status === 'QUESTION' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                {gameState.status === 'LOBBY_READY' ? `Round ${currentRound} Ready` : (gameState.status === 'QUESTION' ? `Time: ${timeLeft}s` : (gameState.status === 'ROUND_END' ? 'Leaderboard' : 'Result'))}
            </div>
            <div className="font-mono font-bold text-indigo-400">{myTeam ? `${myTeam.score} PTS` : 'Spectating'}</div>
         </div>
         {gameState.status === 'QUESTION' && (
            <div className="absolute bottom-0 left-0 h-1 bg-indigo-600 transition-all duration-1000 linear" style={{ width: `${(timeLeft/Math.max(1,currentDuration))*100}%` }}></div>
         )}
      </div>

      {gameState.status === 'LOBBY_READY' && (
         <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <h2 className="text-4xl font-bold text-white mb-4">Quiz is Ready!</h2>
            {iAmHost && <button onClick={() => adminAction('NEXT_QUESTION')} className="bg-white text-black font-black py-4 px-12 rounded-xl text-xl hover:scale-105 transition-transform">{`START ROUND ${currentRound}`}</button>}
         </div>
      )}

      {(gameState.status === 'ROUND_END' || gameState.status === 'FINISHED') && (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-3xl mx-auto w-full">
          <h2 className="text-4xl font-bold text-white mb-6">Leaderboard</h2>
          <p className="text-slate-400 mb-4">After round {currentRound}</p>
          {sortedTeams.length === 0 ? (
            <div className="text-slate-400">No teams yet.</div>
          ) : (
            <div className="w-full space-y-3">
              {sortedTeams.map((team, idx) => (
                <div key={team.id} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-black text-indigo-400">#{idx + 1}</span>
                    <div className="text-left">
                      <div className="text-white font-bold">{team.name}</div>
                      <div className="text-slate-500 text-xs">{team.members.length} player(s)</div>
                    </div>
                  </div>
                  <div className="text-xl font-black text-white">{team.score} pts</div>
                </div>
              ))}
            </div>
          )}

          {iAmHost && gameState.status === 'ROUND_END' && (
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button onClick={startNextRound} className="bg-white text-slate-900 font-black px-6 py-3 rounded-xl hover:bg-gray-100">Start Next Round</button>
              <button onClick={endGame} className="bg-slate-800 text-slate-200 font-bold px-6 py-3 rounded-xl border border-slate-700 hover:bg-slate-700">End Game</button>
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------- */}
      {/* THIS IS THE UPDATED QUESTION BLOCK     */}
      {/* -------------------------------------- */}
      {(gameState.status === 'QUESTION' || gameState.status === 'REVEAL') && gameState.currentQuestion && (
        <div className="flex-1 flex flex-col justify-center items-center p-4 max-w-4xl mx-auto w-full">
           
           {/* === NEW: RESULT BANNER === */}
           {gameState.status === 'REVEAL' && (
             <div className="w-full mb-6 animate-fade-in">
               {gameState.currentQuestion.correctAnswerId === myTeam?.currentAnswerId ? (
                 <div className="bg-green-500 text-white p-4 md:p-6 rounded-2xl shadow-2xl text-center transform scale-105 border-4 border-green-400">
                   <div className="text-3xl md:text-4xl mb-2">🎉</div>
                   <h2 className="text-2xl md:text-3xl font-black uppercase tracking-wider">Correct!</h2>
                   <p className="font-bold opacity-90">+100 Points</p>
                 </div>
               ) : (
                 <div className="bg-red-500 text-white p-4 md:p-6 rounded-2xl shadow-2xl text-center transform scale-105 border-4 border-red-400">
                    <div className="text-3xl md:text-4xl mb-2">❌</div>
                   <h2 className="text-2xl md:text-3xl font-black uppercase tracking-wider">Wrong</h2>
                   <p className="font-bold opacity-90">Good try!</p>
                 </div>
               )}
             </div>
           )}
           {/* === END RESULT BANNER === */}

           <div className="mb-8 w-full">
             <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 text-center">{gameState.currentQuestion.category}</div>
              <h2 className="text-2xl md:text-4xl font-bold text-center text-white leading-tight">{gameState.currentQuestion.text}</h2>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
             {gameState.currentQuestion.answers.map(ans => {
                // Determine Colors based on Game State
                const isCorrect = gameState.currentQuestion.correctAnswerId === ans.id;
                const isSelectedByTeam = myTeam?.currentAnswerId === ans.id;
                const answeringPlayer = myTeam?.lastAnsweredBy ? gameState.players[myTeam.lastAnsweredBy] : null;
                
                let btnStyle = "bg-slate-800 border-slate-700 text-slate-300 opacity-60"; 

                if (gameState.status === 'REVEAL') {
                    if (isCorrect) btnStyle = "bg-green-600 border-green-500 text-white opacity-100 ring-4 ring-green-900"; 
                    else if (isSelectedByTeam) btnStyle = "bg-red-500/20 border-red-500 text-red-300 opacity-100"; 
                } else {
                    if (isSelectedByTeam) btnStyle = "bg-indigo-600 border-indigo-500 text-white opacity-100 shadow-lg scale-[1.02] ring-2 ring-indigo-400"; 
                    else btnStyle = "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 opacity-100"; 
                }

                return (
                  <button key={ans.id} disabled={gameState.status !== 'QUESTION'} onClick={() => submitAnswer(ans.id)} className={`relative p-6 rounded-2xl border-2 text-lg font-bold transition-all ${btnStyle}`}>
                    {ans.text}
                    {isSelectedByTeam && gameState.status === 'QUESTION' && (
                        <div className="absolute -top-2 -right-2 bg-white text-indigo-900 w-8 h-8 flex items-center justify-center rounded-full font-bold border-2 border-indigo-600">
                             {(answeringPlayer?.name || gameState.players[socket.id]?.name || '?').charAt(0).toUpperCase()}
                        </div>
                    )}
                  </button>
                )
             })}
           </div>
        </div>
      )}

      {iAmHost && gameState.status !== 'LOBBY_READY' && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="pointer-events-auto shadow-2xl rounded-2xl overflow-hidden">
             {gameState.status === 'QUESTION' ? (
               <button onClick={() => adminAction('REVEAL')} className="bg-slate-800 text-slate-300 font-bold py-3 px-8 text-sm hover:bg-slate-700 border border-slate-600">Force Reveal</button>
             ) : gameState.status === 'ROUND_END' ? (
               <div className="flex flex-col sm:flex-row">
                 <button onClick={startNextRound} className="bg-white text-slate-900 font-black py-3 px-8 text-sm hover:bg-gray-100">START NEXT ROUND</button>
                 <button onClick={endGame} className="bg-slate-800 text-slate-300 font-bold py-3 px-6 text-sm hover:bg-slate-700 border border-slate-600">End Game</button>
               </div>
             ) : gameState.status === 'FINISHED' ? null : (
               <button onClick={() => adminAction('NEXT_QUESTION')} className="bg-white text-slate-900 font-black py-4 px-12 text-lg hover:bg-gray-100">NEXT QUESTION →</button>
             )}
          </div>
        </div>
      )}
    </div>
  );
}
