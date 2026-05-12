"use client";

import React from 'react';

interface WebSocketMessage {
  type: 'post' | 'comment' | 'vote' | 'notification' | 'user_online' | 'user_offline';
  data: any;
  timestamp: number;
}

interface WebSocketCallbacks {
  onPost?: (data: any) => void;
  onComment?: (data: any) => void;
  onVote?: (data: any) => void;
  onNotification?: (data: any) => void;
  onUserOnline?: (data: any) => void;
  onUserOffline?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private callbacks: WebSocketCallbacks = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private subscriptions = new Set<string>();

  constructor() {
    // No-op until a backend websocket gateway exists.
  }

  private getWebSocketUrl(): string {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, '') || 'localhost:3000';
    return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${apiUrl}/ws`;
  }

  connect(): void {
    return;
  }

  private scheduleReconnect(): void {
    return;
  }

  private handleMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'post':
        this.callbacks.onPost?.(message.data);
        break;
      case 'comment':
        this.callbacks.onComment?.(message.data);
        break;
      case 'vote':
        this.callbacks.onVote?.(message.data);
        break;
      case 'notification':
        this.callbacks.onNotification?.(message.data);
        break;
      case 'user_online':
        this.callbacks.onUserOnline?.(message.data);
        break;
      case 'user_offline':
        this.callbacks.onUserOffline?.(message.data);
        break;
      default:
        return;
    }
  }

  subscribe(channel: string): void {
    this.subscriptions.add(channel);
  }

  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel);
  }

  sendMessage(type: string, data: any): void {
    return;
  }

  setCallbacks(callbacks: WebSocketCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  disconnect(): void {
    this.subscriptions.clear();
    this.reconnectAttempts = 0;
  }

  getConnectionState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let wsManager: WebSocketManager | null = null;

export function getWebSocketManager(): WebSocketManager {
  if (!wsManager) {
    wsManager = new WebSocketManager();
  }
  return wsManager;
}

export function useWebSocket(callbacks: WebSocketCallbacks) {
  const manager = getWebSocketManager();
  
  React.useEffect(() => {
    manager.setCallbacks(callbacks);
    
    return () => {
      // Clean up callbacks when component unmounts
      manager.setCallbacks({});
    };
  }, [manager, callbacks]);
  
  return manager;
}

// React hook for WebSocket
export function useWebSocketSubscription(channel: string, callbacks: WebSocketCallbacks) {
  const manager = getWebSocketManager();
  
  React.useEffect(() => {
    manager.setCallbacks(callbacks);
    manager.subscribe(channel);
    
    return () => {
      manager.unsubscribe(channel);
    };
  }, [manager, channel, callbacks]);
  
  return manager;
}

export default WebSocketManager;
