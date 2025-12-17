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

  // Settings State
  const [difficulty, setDifficulty] = useState('medium');
  const [category, setCategory] = useState('');
  const [qCount, setQCount] = useState(10);

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

    socket.on('error', (err) => alert(err.message));
    socket.on('kicked', () => { alert("You have been kicked."); window.location.reload(); });

    return () => socket.off();
  }, []);

  // --- TIMER LOGIC ---
  useEffect(() => {
    if (gameState?.status === 'QUESTION' && gameState?.currentQuestionEndsAt) {
        const interval = setInterval(() => {
            const secondsRemaining = Math.max(0, Math.ceil((gameState.currentQuestionEndsAt - Date.now()) / 1000));
            setTimeLeft(secondsRemaining);
        }, 1000);
        return () => clearInterval(interval);
    } else {
        setTimeLeft(60);
    }
  }, [gameState?.status, gameState?.currentQuestionEndsAt]);

  // --- ACTIONS ---
  const createRoom = () => { if(!name.trim()) return alert("Nickname required"); socket.emit('create_room', { hostName: name }); };
  const joinRoom = () => { if(!name.trim() || !roomCode.trim()) return alert("Info required"); socket.emit('join_game', { roomCode: roomCode.toUpperCase(), name }); };
  const createTeam = (teamName) => { if(!teamName.trim()) return; socket.emit('create_team', { roomCode: gameState.code, teamName }); };
  const joinTeam = (teamId) => { socket.emit('join_team', { roomCode: gameState.code, teamId }); };
  const submitAnswer = (answerId) => { socket.emit('submit_answer', { roomCode: gameState.code, answerId }); };
  const adminAction = (action, payload = {}) => { socket.emit('host_action', { roomCode: gameState.code, action, payload }); };

  const iAmHost = gameState?.players[socket.id]?.isHost;
  const myPlayer = gameState?.players[socket.id];
  const myTeam = myPlayer?.teamId ? gameState?.teams[myPlayer.teamId] : null;

  // --- COMPONENTS ---

  if (view === 'LANDING') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-brand-card p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full space-y-6">
          <h1 className="text-4xl font-black text-center text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">PUB QUIZ</h1>
          <input className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white" placeholder="Nickname" value={name} onChange={e => setName(e.target.value)}/>
          <div className="flex gap-4">
            <button onClick={createRoom} className="flex-1 bg-indigo-600 font-bold py-3 rounded-xl text-white">Host</button>
            <button onClick={() => setView('JOIN')} className="flex-1 bg-slate-700 font-bold py-3 rounded-xl text-white">Join</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'JOIN') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-xs space-y-4 text-center">
          <input className="w-full bg-slate-900 border-2 border-indigo-500 rounded-xl p-4 text-center text-3xl font-mono uppercase text-white" placeholder="ABCD" maxLength={4} onChange={e => setRoomCode(e.target.value)} />
          <button onClick={joinRoom} className="w-full bg-green-500 font-bold py-4 rounded-xl text-slate-900">ENTER</button>
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
            <div className="grid grid-cols-3 gap-2 mb-4">
                <select className="bg-slate-800 text-white p-2 rounded" value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <select className="bg-slate-800 text-white p-2 rounded" value={difficulty} onChange={e => setDifficulty(e.target.value)}><option value="any">Any Difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
                <select className="bg-slate-800 text-white p-2 rounded" value={qCount} onChange={e => setQCount(Number(e.target.value))}><option value={5}>5 Questions</option><option value={10}>10 Questions</option></select>
            </div>
            <button onClick={() => adminAction('START_GAME', { amount: qCount, difficulty, category })} className="w-full bg-brand-accent hover:bg-yellow-400 text-slate-900 font-bold py-3 rounded-xl">START GAME</button>
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
                {gameState.status === 'LOBBY_READY' ? 'Ready' : (gameState.status === 'QUESTION' ? `Time: ${timeLeft}s` : 'Result')}
            </div>
            <div className="font-mono font-bold text-indigo-400">{myTeam ? `${myTeam.score} PTS` : 'Spectating'}</div>
         </div>
         {gameState.status === 'QUESTION' && (
            <div className="absolute bottom-0 left-0 h-1 bg-indigo-600 transition-all duration-1000 linear" style={{ width: `${(timeLeft/60)*100}%` }}></div>
         )}
      </div>

      {gameState.status === 'LOBBY_READY' && (
         <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <h2 className="text-4xl font-bold text-white mb-4">Quiz is Ready!</h2>
            {iAmHost && <button onClick={() => adminAction('NEXT_QUESTION')} className="bg-white text-black font-black py-4 px-12 rounded-xl text-xl hover:scale-105 transition-transform">START ROUND 1</button>}
         </div>
      )}

      {/* -------------------------------------- */}
      {/* THIS IS THE UPDATED QUESTION BLOCK     */}
      {/* -------------------------------------- */}
      {(gameState.status === 'QUESTION' || gameState.status === 'REVEAL' || gameState.status === 'FINISHED') && gameState.currentQuestion && (
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
                             {gameState.players[socket.id]?.name?.charAt(0).toUpperCase()}
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
             ) : (
               <button onClick={() => adminAction('NEXT_QUESTION')} className="bg-white text-slate-900 font-black py-4 px-12 text-lg hover:bg-gray-100">NEXT QUESTION →</button>
             )}
          </div>
        </div>
      )}
    </div>
  );
}