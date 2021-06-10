import * as cdk from '@aws-cdk/core';
import '@aws-cdk/assert/jest';
import { countResources, expect as expectCDK } from '@aws-cdk/assert';
import { Cluster } from '../../lib/cluster';
import { expectSnapshot } from '../util';

const newStack = () =>
  new cdk.Stack(undefined, 'Stack', {
    env: {
      account: '123213123',
      region: 'us-east-1',
    },
  });

describe('Runtime Cluster', () => {
  describe('Default Setup', () => {
    const stack = newStack();
    new Cluster(stack, 'Cluster', {
      privateDomain: 'private.domain',
      publicDomain: 'public.domain',
    });

    expectSnapshot(stack);

    const countAzs = stack.availabilityZones.length;
    expectInAllAzs(stack, countAzs);
    expectNatSetting(stack, 'gateway', countAzs);
    expectCertificate(stack, false);
  });
  describe('Limited AZs', () => {
    const stack = newStack();
    const countAzs = stack.availabilityZones.length;
    new Cluster(stack, 'Cluster', {
      privateDomain: 'private.domain',
      publicDomain: 'public.domain',
      maxAzs: countAzs - 1,
    });

    expectSnapshot(stack);
    expectInAllAzs(stack, countAzs - 1);
  });
  describe('Use NAT instances', () => {
    const stack = newStack();
    const countAzs = stack.availabilityZones.length;
    new Cluster(stack, 'Cluster', {
      privateDomain: 'private.domain',
      publicDomain: 'public.domain',
      natInstanceType: 't3.micro',
    });

    expectSnapshot(stack);
    expectNatSetting(stack, 'instance', countAzs);
  });
  describe('Maintained certificate', () => {
    const stack = newStack();
    new Cluster(stack, 'Cluster', {
      privateDomain: 'private.domain',
      publicDomain: 'public.domain',
      certificate: true,
    });

    expectSnapshot(stack);
    expectCertificate(stack, true);
  });
});

function expectInAllAzs(stack: cdk.Construct, azs: number) {
  test('Is in all AZs', () => {
    expectCDK(stack).to(countResources('AWS::EC2::Subnet', azs * 2));
    expectCDK(stack).to(countResources('AWS::EC2::RouteTable', azs * 2));
    expectCDK(stack).to(countResources('AWS::EC2::SubnetRouteTableAssociation', azs * 2));
  });
}

function expectNatSetting(stack: cdk.Construct, kind: 'gateway' | 'instance', azs: number) {
  if (kind == 'gateway') {
    test('NAT Gateways in all AZs', () => {
      expectCDK(stack).to(countResources('AWS::EC2::NatGateway', azs));
      expectCDK(stack).to(countResources('AWS::EC2::EIP', azs));
    });
  } else {
    test('NAT Instances in all AZs', () => {
      expect(stack).toCountResources('AWS::IAM::InstanceProfile', azs);
      expect(stack).toCountResources('AWS::EC2::Instance', azs);
    });
  }
}

function expectCertificate(stack: cdk.Construct, created: boolean) {
  if (created) {
    test('Certificate is maintained', () => {
      expect(stack).toHaveResourceLike('AWS::Lambda::Function', {
        Handler: 'index.certificateRequestHandler',
      });
    });
  } else {
    test('No certificate maintained', () => {
      expect(stack).toCountResources('AWS::Lambda::Function', 0);
    });
  }
}

function expectCertificateACM(stack: cdk.Construct, created: boolean) {
  if (created) {
    test('Certificate is maintained', () => {
      expect(stack).toHaveResource('AWS::CertificateManager::Certificate', {
        DomainName: '*.public.domain',
      });
    });
  } else {
    test('No certificate maintained', () => {
      expect(stack).toCountResources('AWS::CertificateManager::Certificate', 0);
    });
  }
}
