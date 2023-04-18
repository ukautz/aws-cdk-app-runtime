import { Template } from 'aws-cdk-lib/assertions';
import { IConstruct } from 'constructs';

export function expectSnapshot(template: Template) {
  test('Matches Snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });
}

export function getChild(node: IConstruct, ...names: string[]): IConstruct {
  if (names.length > 0) {
    return getChild(node.node.findChild(names[0]), ...names.slice(1));
  }
  return node;
}
