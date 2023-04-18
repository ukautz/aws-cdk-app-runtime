import * as cxschema from '@aws-cdk/cloud-assembly-schema';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Wrapper for context loopkup
 *
 * @param scope
 * @param props
 * @returns
 */
export const contextValueFromLookup = (
  scope: Construct,
  props: { provider: string; parameterName: string; dummyValue?: string }
): string =>
  cdk.ContextProvider.getValue(scope, {
    provider: props.provider,
    props: { parameterName: props.parameterName },
    dummyValue: props.dummyValue ?? `dummy-value-for-${props.parameterName}`,
  }).value;

/**
 * Wrapper for SSM string parameter value lookup from context.
 *
 * Helps in cases described here: https://github.com/aws/aws-cdk/issues/7051
 *
 * @param scope
 * @param name
 * @param dummyValue
 * @returns
 */
export const ssmValueFromLookup = (scope: Construct, name: string, dummyValue?: string): string =>
  contextValueFromLookup(scope, {
    provider: cxschema.ContextProvider.SSM_PARAMETER_PROVIDER,
    parameterName: name,
    dummyValue,
  });
