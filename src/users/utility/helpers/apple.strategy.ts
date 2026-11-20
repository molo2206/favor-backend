import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';

const client = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000,
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  if (!header.kid) {
    return callback(new Error('Missing KID in token header'), undefined);
  }

  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err, undefined);

    const signingKey = key?.getPublicKey();
    if (!signingKey) {
      return callback(new Error('Signing key not found'), undefined);
    }

    callback(null, signingKey);
  });
}

export async function verifyAppleToken(identityToken: string): Promise<any> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      identityToken,
      getKey,
      {
        issuer: 'https://appleid.apple.com',
      },
      (err, decoded: any) => {
        if (err) {
          if (err.name === 'TokenExpiredError') {
            return reject(
              new UnauthorizedException('Le token Apple a expiré. Veuillez vous reconnecter.'),
            );
          }

          return reject(new BadRequestException('Token Apple invalide ou non vérifiable'));
        }

        const allowedAudiences = [
          'com.favorgroup.favorseller', // ancienne app mobile
          'com.favorgroup.favorhelp', // app mobile actuelle
          'com.favorgroup.web', // web / Service ID
        ];

        if (!decoded?.aud || !allowedAudiences.includes(decoded.aud)) {
          return reject(new UnauthorizedException(`Audience Apple invalide : ${decoded?.aud}`));
        }

        if (!decoded.sub) {
          return reject(new BadRequestException('Token Apple incomplet'));
        }

        resolve(decoded);
      },
    );
  });
}
