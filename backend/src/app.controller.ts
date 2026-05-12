import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { Connection } from 'mongoose'
import { AppService } from './app.service'
import { RedisService } from './redis/redis.service'

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectConnection() private readonly connection: Connection,
    private readonly redis: RedisService
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello()
  }

  @Get('health/live')
  live() {
    return {
      status: 'ok',
      service: 'jagoo-bahee-backend',
      instance: process.env.INSTANCE_ID || process.env.HOSTNAME || 'local',
      uptime: process.uptime()
    }
  }

  @Get('health/ready')
  async ready() {
    const mongoReady = this.connection.readyState === 1
    let redisReady = false
    try {
      redisReady = (await this.redis.getClient().ping()) === 'PONG'
    } catch (e) {
      redisReady = false
    }

    if (!mongoReady || !redisReady) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        mongo: mongoReady,
        redis: redisReady
      })
    }

    return {
      status: 'ok',
      mongo: true,
      redis: true,
      instance: process.env.INSTANCE_ID || process.env.HOSTNAME || 'local'
    }
  }
}
