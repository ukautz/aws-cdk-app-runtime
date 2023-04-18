import { aws_ecr as ecr, aws_ecs as ecs } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

/**
 *
 * @param scope
 * @param imageName can be `<dockerhub image>` or `ecr:<arn>` or `path:</to/folder/with/dockerfile>`
 * @param imageVersion for docker hub image: added version tag, for ecr: added version arn, for local path: value of BUILD_TAG build parameter
 */
export const loadContainerImage = (
  scope: Construct,
  imageName: string,
  imageVersion?: string,
  buildArgs?: Record<string, string>
): { image: ecs.ContainerImage; repository: ecr.IRepository | undefined } => {
  let repository: ecr.IRepository | undefined;
  let image: ecs.ContainerImage;

  // load from file
  if (imageName.startsWith('path:')) {
    let directory = imageName.substr('path:'.length);
    let opt: Partial<ecs.AssetImageProps> = {};

    // can point to directory containing Dockerfile OR pointing to specific CustomDockerfile
    if (fs.statSync(directory).isFile()) {
      const file = path.basename(directory);
      directory = path.dirname(directory);
      opt = { file };
    }

    image = ecs.ContainerImage.fromAsset(directory, {
      ...opt,
      buildArgs: {
        ...(buildArgs ?? {}),
        BUILD_TAG: imageVersion ?? 'latest',
      },
    });

    // load from ECR repository
  } else if (imageName.startsWith('ecr:')) {
    const name = imageName.substr('ecr:'.length);
    const repoName = parseEcrImageName(name);
    repository = ecr.Repository.fromRepositoryName(scope, 'Repository', repoName);
    image = ecs.ContainerImage.fromEcrRepository(repository, imageVersion);

    // load from DockerHub or another online registry
  } else {
    image = ecs.ContainerImage.fromRegistry(imageName + ':' + imageVersion);
  }
  return { image, repository };
};

/**
 * Parses ECR image URL into ECR image repo ARN and image tag
 *
 * @param image - the image ECR URL, like `123123123.dkr.ecr.xx-region-1.amazonaws.com/repo-name:image-version-tag`
 * @returns the image repository name (like `arn:aws:ecr:xx-region-1:123123123:repository/repo-name`) and the image tag (like `v1.2.3`)
 */
function parseEcrImageName(image: string): string {
  const match = image.match(/^([0-9]+)\.dkr\.ecr\.([^.]+)\.amazonaws\.com\/([^:]+)$/);
  if (!match) {
    throw new Error(`invalid ECR image URL "${image}" (hint: must not contain tag)`);
  }

  //arn:aws:ecr:xx-region-1:123123123:repository/repo-name
  return `arn:aws:ecr:${match[2]}:${match[1]}:repository/${match[3]}`;
}
