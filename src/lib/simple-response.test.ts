import { expect, it } from 'vitest';
import { simpleResponse } from './simple-response';
it('answers greetings and platform questions without research', () => {
  expect(simpleResponse('Hola!')).toContain('genética');
  expect(simpleResponse('Qué puedes hacer?')).toContain('Evidence & Sources');
});
it('does not intercept scientific questions containing greetings', () => {
  expect(simpleResponse('Hola, qué hace HIF1A?')).toBeNull();
  expect(simpleResponse('Compare gene expression under hypoxia')).toBeNull();
});
