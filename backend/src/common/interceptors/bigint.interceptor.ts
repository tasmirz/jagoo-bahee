import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.transform(data)));
  }

  private transform(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'bigint') {
      return data.toString();
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.transform(item));
    }

    if (typeof data === 'object') {
      if (data instanceof Date) return data;
      if (Buffer.isBuffer(data)) return data;
      
      const objToTransform = typeof data.toJSON === 'function' ? data.toJSON() : data;
      
      if (objToTransform === null || objToTransform === undefined) {
        return objToTransform;
      }
      if (typeof objToTransform !== 'object') {
        return this.transform(objToTransform);
      }

      const transformed: any = {};
      for (const key in objToTransform) {
        if (Object.prototype.hasOwnProperty.call(objToTransform, key)) {
          transformed[key] = this.transform(objToTransform[key]);
        }
      }
      return transformed;
    }

    return data;
  }
}
