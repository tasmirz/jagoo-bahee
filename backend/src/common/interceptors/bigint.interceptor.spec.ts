import { of } from 'rxjs'
import { BigIntInterceptor } from './bigint.interceptor'

describe('BigIntInterceptor', () => {
  let interceptor: BigIntInterceptor

  beforeEach(() => {
    interceptor = new BigIntInterceptor()
  })

  it('should transform BigInt to string', done => {
    const data = {
      id: BigInt(1),
      nested: {
        val: BigInt(2),
        list: [BigInt(3), { a: BigInt(4) }]
      },
      regular: 'string'
    }

    const callHandler = {
      handle: () => of(data)
    }

    interceptor.intercept({} as any, callHandler as any).subscribe(result => {
      expect(result.id).toBe('1')
      expect(result.nested.val).toBe('2')
      expect(result.nested.list[0]).toBe('3')
      expect(result.nested.list[1].a).toBe('4')
      expect(result.regular).toBe('string')
      done()
    })
  })

  it('should handle null and undefined', done => {
    const callHandler = {
      handle: () => of(null)
    }

    interceptor.intercept({} as any, callHandler as any).subscribe(result => {
      expect(result).toBeNull()
      done()
    })
  })
})
