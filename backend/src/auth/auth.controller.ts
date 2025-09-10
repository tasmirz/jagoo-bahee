import { Body, Controller, Get, Post } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthenticationDto } from './dto/authenticate.dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post()
  authenticate(@Body() auth: AuthenticationDto) {
    return this.authService.authenticate(auth)
  }
  @Get('challenge/') // TODO: add PoW and rate limit
  challenge(): string {
    return this.authService.challenge()
  }
}
