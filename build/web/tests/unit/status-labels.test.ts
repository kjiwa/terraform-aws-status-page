import { describe, expect, it } from 'vitest';
import { groupStateLabel, lifecycleLabel, volumeStateLabel } from '../../src/status/labels.ts';

describe('plain-language labels', () => {
  it('names the instance lifecycles', () => {
    expect(lifecycleLabel('spot')).toBe('Spot (discounted, can be reclaimed)');
    expect(lifecycleLabel('on-demand')).toBe('On-demand (standard price)');
  });

  it('names the ASG lifecycle states', () => {
    expect(groupStateLabel('InService')).toBe('In service');
    expect(groupStateLabel('Pending:Wait')).toBe('Starting, held for the handoff');
    expect(groupStateLabel('Terminating')).toBe('Shutting down');
  });

  it('names the EBS volume states', () => {
    expect(volumeStateLabel('in-use')).toBe('In use (attached)');
    expect(volumeStateLabel('available')).toBe('Available (not attached)');
  });

  it('shows an unknown value as it came, and nothing for an empty one', () => {
    expect(lifecycleLabel('scheduled')).toBe('scheduled');
    expect(groupStateLabel('Warmed:Hibernated')).toBe('Warmed:Hibernated');
    expect(volumeStateLabel('')).toBe('');
  });
});
