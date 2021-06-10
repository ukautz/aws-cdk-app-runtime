import * as cdk from '@aws-cdk/core';
import '@aws-cdk/assert/jest';
import { SynthUtils } from '@aws-cdk/assert';

export interface TestSpecProps<TSpec> {
  readonly name: string;
  readonly keys: string[];
  readonly make: (generator?: (prop: string) => string) => TSpec;
  readonly fromContext: (scope: cdk.Construct, prefix?: string) => TSpec;
  readonly fromSsm: (scope: cdk.Construct, prefix?: string) => TSpec;
  readonly toSsm: (scope: cdk.Construct, prefix: string, specs: TSpec, secure?: boolean) => void;
}

export function assertSpecs<TSpec>(props: TestSpecProps<TSpec>) {
  describe(props.name, () => {
    describe('Make', () => {
      it('Can create empty', () => {
        expect(props.make()).toEqual(Object.fromEntries(props.keys.map((key) => [key, ''])));
      });
      it('Can create identity', () => {
        expect(props.make((key) => key)).toEqual(Object.fromEntries(props.keys.map((key) => [key, key])));
      });
      it('Can create prefixed', () => {
        expect(props.make((key) => `prefixed-${key}`)).toEqual(
          Object.fromEntries(props.keys.map((key) => [key, `prefixed-${key}`]))
        );
      });
    });
    it('Loads from Context', () => {
      const app = new cdk.App({
        context: Object.fromEntries(props.keys.map((key) => [`/prefixed/${key}`, `val-${key}`])),
      });
      const specs = props.fromContext(app, '/prefixed/');
      expect(specs).toEqual(props.make((key) => `val-${key}`));
    });
    it('Loads from Ssm', () => {
      const app = new cdk.App({
        context: Object.fromEntries(
          props.keys.map((key) => [
            `ssm:account=123123123:parameterName=/prefixed/${key}:region=us-east-1`,
            `val-${key}`,
          ])
        ),
      });
      const stack = new cdk.Stack(app, 'Stack', {
        env: {
          account: '123123123',
          region: 'us-east-1',
        },
      });
      const specs = props.fromSsm(stack, '/prefixed/');
      expect(specs).toEqual(props.make((key) => `val-${key}`));
    });
    describe('Store to Ssm', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack', {
        env: {
          account: '123123123',
          region: 'us-east-1',
        },
      });
      props.toSsm(
        stack,
        '/prefixed/',
        props.make((key) => key)
      );
      it('Matches Snapshot', () => {
        expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
      });
      it('Spec properties in Cloudformation', () => {
        expect(stack).toCountResources('AWS::SSM::Parameter', props.keys.length);
        props.keys.forEach((key) => {
          expect(stack).toHaveResource('AWS::SSM::Parameter', {
            Name: `/prefixed/${key}`,
            Type: 'String',
            Value: key,
          });
        });
      });
    });
    describe('Store Encrypted to Ssm', () => {
      const app = new cdk.App();
      const stack = new cdk.Stack(app, 'Stack', {
        env: {
          account: '123123123',
          region: 'us-east-1',
        },
      });
      props.toSsm(
        stack,
        '/prefixed/',
        props.make((key) => key),
        true
      );
      it('Matches Snapshot', () => {
        expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
      });
      it('Spec properties in Cloudformation', () => {
        expect(stack).toCountResources('AWS::SSM::Parameter', props.keys.length);
        props.keys.forEach((key) => {
          expect(stack).toHaveResource('AWS::SSM::Parameter', {
            Name: `/prefixed/${key}`,
            Type: 'SecureString',
            Value: key,
          });
        });
      });
    });
  });
}
