"use client";

import React from 'react';
import { getToken } from './auth';

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
    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, '') || 'localhost:3000';
    return `${protocol}//${apiUrl}/ws`;
  }

  connect(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    const token = getToken();
    
    if (!token) {
      this.isConnecting = false;
      return;
    }

    try {
      const wsUrl = `${this.getWebSocketUrl()}?token=${encodeURIComponent(token)}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.callbacks.onConnect?.();
        
        // Re-subscribe to all channels
        this.subscriptions.forEach(channel => {
          this.subscribe(channel);
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.isConnecting = false;
        this.callbacks.onDisconnect?.();
        
        if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        // Only log if it's not a connection refused error (common in development)
        if (this.reconnectAttempts === 0) {
          console.warn('WebSocket connection failed, will retry...');
        }
        this.isConnecting = false;
        this.callbacks.onError?.(error);
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.isConnecting = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
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
        console.log('Unknown message type:', message.type);
    }
  }

  subscribe(channel: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.subscriptions.add(channel);
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'subscribe',
      channel
    }));
    
    this.subscriptions.add(channel);
  }

  unsubscribe(channel: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.subscriptions.delete(channel);
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'unsubscribe',
      channel
    }));
    
    this.subscriptions.delete(channel);
  }

  sendMessage(type: string, data: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send message');
      return;
    }

    this.ws.send(JSON.stringify({
      type,
      data,
      timestamp: Date.now()
    }));
  }

  setCallbacks(callbacks: WebSocketCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
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
