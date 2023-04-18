import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Construct } from 'constructs';

export interface TestSpecProps<TSpec> {
  readonly name: string;
  readonly keys: string[];
  readonly make: (generator?: (prop: string) => string) => TSpec;
  readonly fromContext: (scope: Construct, prefix?: string) => TSpec;
  readonly fromSsm: (scope: Construct, prefix?: string) => TSpec;
  readonly toSsm: (scope: Construct, prefix: string, specs: TSpec) => void;
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
      const template = Template.fromStack(stack);
      it('Matches Snapshot', () => {
        expect(template.toJSON()).toMatchSnapshot();
      });
      it('Spec properties in Cloudformation', () => {
        template.resourceCountIs('AWS::SSM::Parameter', props.keys.length);
        props.keys.forEach((key) => {
          template.hasResourceProperties('AWS::SSM::Parameter', {
            Name: `/prefixed/${key}`,
            Type: 'String',
            Value: key,
          });
        });
      });
    });
  });
}
