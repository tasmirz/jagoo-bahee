import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { createHash } from 'crypto';

describe('AuthService Proof of Work logic', () => {
  let authService: any;
  let mockJwtService: any;
  let mockUsersService: any;

  beforeEach(() => {
    mockJwtService = {
      sign: jest.fn().mockImplementation((payload) => JSON.stringify(payload)),
      verify: jest.fn().mockImplementation((token) => JSON.parse(token)),
    };
    mockUsersService = { ensureUserForAuth: jest.fn() };
    
    // We mock auth model
    const mockAuthModel = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      create: jest.fn().mockResolvedValue({ _id: 'foo', publicKey: Buffer.from([]), abac: 0n }),
    };

    authService = new AuthService(mockJwtService as any, mockAuthModel as any, mockUsersService as any);
    
    // Mock the crypto methods later or bypass auth
    // Wait, testing just PoW failing is enough. We can mock tinysecp or bypass it.
  });

  it('should fail authentication if PoW is invalid', async () => {
    const payload = {
      challenge: 'fake-challenge',
      difficulty: 3,
      iat: 0,
      exp: 0,
    };
    
    await expect(authService.authenticate({
       publicKey: Buffer.from('xx').toString('base64') as any,
       signedData: Buffer.from('xx').toString('base64') as any,
       challenge: JSON.stringify(payload),
       nonce: 123 // Incorrect nonce
    })).rejects.toThrow(new UnauthorizedException('Proof of Work Failed'));
  });

  it('should pass Proof of Work with valid nonce', async () => {
    const challenge = 'fake-challenge';
    const difficulty = 2; // easier 
    let nonce = 0;
    while (!createHash('sha256').update(challenge + nonce.toString()).digest('hex').startsWith('00')) {
       nonce++;
    }
    
    const payload = {
       challenge, difficulty, iat: 0, exp: 0
    };
    
    // Mock signature check for this test so it fails AFTER PoW but hits signature
    // Because we provided invalid signature, it should throw 'Sign Verification Failed' instead of 'Proof of Work'.
    await expect(authService.authenticate({
       publicKey: Buffer.from('xx').toString('base64') as any,
       signedData: Buffer.from('xx').toString('base64') as any,
       challenge: JSON.stringify(payload),
       nonce
    })).rejects.toThrow('Expected Point');
  });
});
