import '@aws-cdk/assert/jest';
import { TaskSpecs, taskSpecKeys } from '../../lib/service';
import { assertSpecs } from '../util/specs.suite';

describe('Task Specs', () => {
  test('Can list keys', () => {
    expect(taskSpecKeys).toEqual(['arn', 'cluster', 'iamPrincipal', 'resources', 'securityGroupIds', 'task'].sort());
  });
  assertSpecs<TaskSpecs>({
    name: 'Task',
    keys: taskSpecKeys,
    make: TaskSpecs.make,
    fromContext: TaskSpecs.fromContext,
    fromSsm: TaskSpecs.fromSsm,
    toSsm: TaskSpecs.toSsm,
  });
});
