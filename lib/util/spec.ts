import * as cdk from 'aws-cdk-lib';
import { aws_ssm as ssm } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { ssmValueFromLookup } from './context';

export class SpecUtil {
  public static make<TSpec>(props: string[], generator?: (prop: string) => string): TSpec {
    const specs: Record<string, string> = {};
    props.forEach((prop) => {
      specs[prop] = generator ? generator(prop) : '';
    });
    return specs as unknown as TSpec;
  }

  public static fromContext<TSpec>(props: string[], scope: Construct, prefix?: string): TSpec {
    const specs: Record<string, string> = {};
    const pref = prefix ?? '';
    props.forEach((prop) => {
      const key = `${pref}${prop}`;
      const val = scope.node.tryGetContext(key);
      if (val === undefined) {
        cdk.Annotations.of(scope).addError(`missing context ${key} for specs`);
      }
      specs[prop] = val ?? '';
    });
    return specs as unknown as TSpec;
  }

  public static fromSsm<TSpec>(props: string[], scope: Construct, prefix?: string): TSpec {
    const specs: Record<string, string> = {};
    const pref = prefix ?? '';
    props.forEach((prop) => {
      specs[prop] = ssmValueFromLookup(
        scope,
        `${pref}${prop}`,

        // why-o-why?
        // during synthesis, the dummy value that is "loaded from SSM" would contain
        // a string of the form `dummy-value-for-<name>`. If the spec is meant to
        // contain an ARN, that is used to read another resource by it's ARN, then
        // AWS CDK will fail an complain that the provided (dummy) value is _not_
        // an valid looking ARN.
        // See: https://github.com/aws/aws-cdk/issues/7051
        prop.match(/Arn(?:[A-Z]|\b)/) ? `arn:two:three:four:five:${prop}` : undefined
      );
    });
    return specs as unknown as TSpec;
  }

  public static toSsm<TSpec extends Record<string, unknown>>(
    props: string[],
    scope: Construct,
    prefix: string,
    specs: TSpec
  ): void {
    Object.entries(specs)
      .filter(([prop]) => specs[prop]) // cannot store empty values
      .forEach(([prop, value]) => {
        const name = prop.slice(0, 1).toUpperCase() + prop.slice(1);
        new ssm.StringParameter(scope, `${name}Spec`, {
          parameterName: `${prefix}${prop}`,
          stringValue: `${value}`,
        });
      });
  }
}
