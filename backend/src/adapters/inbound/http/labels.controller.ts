import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { LabelProvider } from '../../../core/ports/content.port.js';

interface PreflightRequest {
  readonly text?: string;
  readonly scope?: string;
}

/**
 * Advisory-only composer check (LBL-05/LBL-06). Provider failure is returned as no advice;
 * it can never become a publishing gate.
 */
@Controller('v1/labels')
export class LabelsController {
  constructor(@Inject(LabelProvider) private readonly labels: LabelProvider) {}

  @Post('preflight')
  @HttpCode(200)
  async preflight(@Body() request: PreflightRequest): Promise<Record<string, unknown>> {
    if (typeof request?.text !== 'string') {
      return { advisory: null, available: true };
    }
    try {
      const advice = await this.labels.preflight({
        text: request.text,
        scope: typeof request.scope === 'string' ? request.scope : '',
      });
      return { advisory: advice.advisory, available: true };
    } catch {
      return { advisory: null, available: false };
    }
  }
}
