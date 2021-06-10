import * as cdk from '@aws-cdk/core';
import { SynthUtils, expect as expectCDK } from '@aws-cdk/assert';

export function expectSnapshot(stack: cdk.Stack) {
  test('Matches Snapshot', () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
    //expectCDK(stack).
  });
}
