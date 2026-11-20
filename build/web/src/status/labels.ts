/**
 * Plain-language names for the AWS enums the panels show. An unrecognised
 * value is shown as it came rather than hidden.
 */
const LIFECYCLES: Record<string, string> = {
  spot: 'Spot (discounted, can be reclaimed)',
  'on-demand': 'On-demand (standard price)',
};

const GROUP_STATES: Record<string, string> = {
  InService: 'In service',
  Pending: 'Starting',
  'Pending:Wait': 'Starting, held for the handoff',
  'Pending:Proceed': 'Starting, handoff done',
  Terminating: 'Shutting down',
  'Terminating:Wait': 'Shutting down, held for the handoff',
  'Terminating:Proceed': 'Shutting down, handoff done',
  Terminated: 'Shut down',
  Standby: 'On standby',
  EnteringStandby: 'Moving to standby',
  Detaching: 'Leaving the group',
  Detached: 'Left the group',
};

const VOLUME_STATES: Record<string, string> = {
  creating: 'Creating',
  available: 'Available (not attached)',
  'in-use': 'In use (attached)',
  deleting: 'Deleting',
  deleted: 'Deleted',
  error: 'Error',
};

const named = (names: Record<string, string>) => (value: string) => names[value] ?? value;

export const lifecycleLabel = named(LIFECYCLES);
export const groupStateLabel = named(GROUP_STATES);
export const volumeStateLabel = named(VOLUME_STATES);
