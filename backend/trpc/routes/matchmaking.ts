import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";

interface MatchmakingQueue {
  playerId: string;
  username: string;
  rating: number;
  country: string;
  avatar: string;
  stake: number;
  timestamp: number;
}

interface ActiveGame {
  gameId: string;
  player1: {
    id: string;
    username: string;
    rating: number;
    country: string;
    avatar: string;
  };
  player2: {
    id: string;
    username: string;
    rating: number;
    country: string;
    avatar: string;
  };
  stake: number;
  startTime: number;
  currentTurn: string;
  gameState: string;
  player1Time: number;
  player2Time: number;
}

const matchmakingQueues: Map<number, MatchmakingQueue[]> = new Map();
const activeGames: Map<string, ActiveGame> = new Map();
const playerToGame: Map<string, string> = new Map();

function findMatch(queue: MatchmakingQueue[], newPlayer: MatchmakingQueue): MatchmakingQueue | null {
  const ratingRange = 200;
  
  for (const player of queue) {
    if (player.playerId === newPlayer.playerId) continue;
    
    const ratingDiff = Math.abs(player.rating - newPlayer.rating);
    if (ratingDiff <= ratingRange) {
      return player;
    }
  }
  
  return null;
}

function createGameId(): string {
  return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const matchmakingRouter = createTRPCRouter({
  joinQueue: publicProcedure
    .input(z.object({
      playerId: z.string(),
      username: z.string(),
      rating: z.number(),
      country: z.string(),
      avatar: z.string(),
      stake: z.number(),
    }))
    .mutation(({ input }) => {
      console.log(`Player ${input.username} joining queue with stake ${input.stake}`);
      
      if (!matchmakingQueues.has(input.stake)) {
        matchmakingQueues.set(input.stake, []);
      }
      
      const queue = matchmakingQueues.get(input.stake)!;
      
      const existingIndex = queue.findIndex(p => p.playerId === input.playerId);
      if (existingIndex !== -1) {
        queue.splice(existingIndex, 1);
      }
      
      const newPlayer: MatchmakingQueue = {
        ...input,
        timestamp: Date.now(),
      };
      
      const opponent = findMatch(queue, newPlayer);
      
      if (opponent) {
        const gameId = createGameId();
        const game: ActiveGame = {
          gameId,
          player1: {
            id: opponent.playerId,
            username: opponent.username,
            rating: opponent.rating,
            country: opponent.country,
            avatar: opponent.avatar,
          },
          player2: {
            id: newPlayer.playerId,
            username: newPlayer.username,
            rating: newPlayer.rating,
            country: newPlayer.country,
            avatar: newPlayer.avatar,
          },
          stake: input.stake,
          startTime: Date.now(),
          currentTurn: opponent.playerId,
          gameState: new Date().toISOString(),
          player1Time: 120,
          player2Time: 120,
        };
        
        activeGames.set(gameId, game);
        playerToGame.set(opponent.playerId, gameId);
        playerToGame.set(newPlayer.playerId, gameId);
        
        const opponentIndex = queue.findIndex(p => p.playerId === opponent.playerId);
        if (opponentIndex !== -1) {
          queue.splice(opponentIndex, 1);
        }
        
        console.log(`Match found! Game ${gameId} created between ${opponent.username} and ${newPlayer.username}`);
        
        return {
          matched: true,
          gameId,
          opponent: game.player1,
        };
      } else {
        queue.push(newPlayer);
        console.log(`Player ${input.username} added to queue. Queue size: ${queue.length}`);
        
        return {
          matched: false,
          queuePosition: queue.length,
        };
      }
    }),

  leaveQueue: publicProcedure
    .input(z.object({
      playerId: z.string(),
      stake: z.number(),
    }))
    .mutation(({ input }) => {
      console.log(`Player ${input.playerId} leaving queue`);
      
      const queue = matchmakingQueues.get(input.stake);
      if (queue) {
        const index = queue.findIndex(p => p.playerId === input.playerId);
        if (index !== -1) {
          queue.splice(index, 1);
          console.log(`Player removed from queue. Queue size: ${queue.length}`);
        }
      }
      
      return { success: true };
    }),

  checkMatchStatus: publicProcedure
    .input(z.object({
      playerId: z.string(),
    }))
    .query(({ input }) => {
      const gameId = playerToGame.get(input.playerId);
      
      if (gameId) {
        const game = activeGames.get(gameId);
        if (game) {
          const isPlayer1 = game.player1.id === input.playerId;
          const opponent = isPlayer1 ? game.player2 : game.player1;
          
          return {
            matched: true,
            gameId,
            opponent,
          };
        }
      }
      
      return {
        matched: false,
      };
    }),

  getGameState: publicProcedure
    .input(z.object({
      gameId: z.string(),
    }))
    .query(({ input }) => {
      const game = activeGames.get(input.gameId);
      
      if (!game) {
        throw new Error("Game not found");
      }
      
      return game;
    }),

  updateGameState: publicProcedure
    .input(z.object({
      gameId: z.string(),
      playerId: z.string(),
      move: z.string(),
      gameState: z.string(),
      player1Time: z.number(),
      player2Time: z.number(),
    }))
    .mutation(({ input }) => {
      const game = activeGames.get(input.gameId);
      
      if (!game) {
        throw new Error("Game not found");
      }
      
      if (game.currentTurn !== input.playerId) {
        throw new Error("Not your turn");
      }
      
      game.gameState = input.gameState;
      game.player1Time = input.player1Time;
      game.player2Time = input.player2Time;
      game.currentTurn = game.currentTurn === game.player1.id ? game.player2.id : game.player1.id;
      
      console.log(`Game ${input.gameId} updated. Move: ${input.move}`);
      
      return { success: true };
    }),

  endGame: publicProcedure
    .input(z.object({
      gameId: z.string(),
      winnerId: z.string().optional(),
      reason: z.string(),
    }))
    .mutation(({ input }) => {
      const game = activeGames.get(input.gameId);
      
      if (game) {
        playerToGame.delete(game.player1.id);
        playerToGame.delete(game.player2.id);
        activeGames.delete(input.gameId);
        
        console.log(`Game ${input.gameId} ended. Reason: ${input.reason}`);
      }
      
      return { success: true };
    }),

  getQueueStats: publicProcedure
    .input(z.object({
      stake: z.number(),
    }))
    .query(({ input }) => {
      const queue = matchmakingQueues.get(input.stake) || [];
      
      return {
        queueSize: queue.length,
        averageWaitTime: queue.length > 0 
          ? Math.floor((Date.now() - queue[0].timestamp) / 1000)
          : 0,
      };
    }),
});
