import { Token } from './types';
import { EventEmitter } from 'events';
export declare class PumpSimulator extends EventEmitter {
    private isRunning;
    private tokenCounter;
    private activeTokens;
    private simulationInterval;
    private tradeInterval;
    private config;
    constructor();
    start(): void;
    stop(): void;
    private createRandomToken;
    private simulateRandomTrades;
    private simulateGraduation;
    getActiveTokens(): Token[];
    getToken(mint: string): Token | undefined;
    isActive(): boolean;
}
//# sourceMappingURL=pumpSimulator.d.ts.map