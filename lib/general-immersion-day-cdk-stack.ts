import * as cdk from 'aws-cdk-lib';
import { AutoScalingGroup, GroupMetrics } from 'aws-cdk-lib/aws-autoscaling';
import { AmazonLinuxCpuType, AmazonLinuxGeneration, AmazonLinuxImage, GatewayVpcEndpointAwsService, Instance, InstanceType, IpAddresses, LaunchTemplate, SecurityGroup, SubnetType, UserData, Vpc } from 'aws-cdk-lib/aws-ec2';
import { ApplicationLoadBalancer, ApplicationTargetGroup } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { InstanceIdTarget } from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import { InstanceProfile, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class GeneralImmersionDayCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //create a VPC on 2AZs, with cidr 10.0.0.0/16, 1 NAT and DNS support
    const vpc = new Vpc(this, 'vpc', {
      maxAzs: 2,
      ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
      natGateways: 1,
      enableDnsHostnames: true,
      enableDnsSupport: true
    });

    //create Gateway VpcEndpoint for s3 for private subnets with egress
    const s3Endpoint = vpc.addGatewayEndpoint('s3Endpoint', {
      service: GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: SubnetType.PRIVATE_WITH_EGRESS }],
    });

    //give full access to s3Endpoint to any principal
    s3Endpoint.addToPolicy(new PolicyStatement({
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['s3:*'],
      resources: ['*'],
      principals: [new cdk.aws_iam.AnyPrincipal()]
    }));

    const ec2UserDataWebServer = UserData.forLinux();
    ec2UserDataWebServer.addCommands(
      'dnf install -y httpd wget php-fpm php-mysqli php-json php php-devel',
      'dnf install -y mariadb105-server',
      'dnf install -y httpd php-mbstring',
      //Start the web server
      'chkconfig httpd on',
      'systemctl start httpd',

      //Install the web pages for our lab
      `if [ ! -f /var/www/html/immersion-day-app-php7.zip ]; then
        cd /var/www/html
        wget -O 'immersion-day-app-php7.zip' 'https://static.us-east-1.prod.workshops.aws/ba07580b-344f-469c-bd22-5cdb3818d802/assets/immersion-day-app-php7.zip?Key-Pair-Id=K36Q2WVO3JP7QD&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9zdGF0aWMudXMtZWFzdC0xLnByb2Qud29ya3Nob3BzLmF3cy9iYTA3NTgwYi0zNDRmLTQ2OWMtYmQyMi01Y2RiMzgxOGQ4MDIvKiIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTcxMzkxMzE0NH19fV19&Signature=c4Es5V8ZhYM8IuVxR3Z1t424OY7237lbMmD9q3JzqszLtaMxy8P3Cw3bMF3Ormw6XUieYcVTH-uxM2KjPL8YCXkxv~xTcUA6b3j-Z3ovAivm8oGQIkzqj0Phu3oAF9xATP~Q6ebzpn8-6GtQ~ce764YeHXf-U--TiwnANGP6X6oyzawrBaXwcWOKr34vRRfXUuiji6Ulij37MqGfnt3HgCaq8eoKijjJQuDJCBcLfmt-tZQ5RI8RmY6c1CAxRmBj1Yq-NlWnam8jITw-jx8GXIuQHesJQ-m0nA6iqtYLSyYAslxEbhAdx3jtpdKdXWbGTRQOKvZW8Fh3Xq3-078OFg__'
        unzip immersion-day-app-php7.zip
      fi`,

      //#Install the AWS SDK for PHP
      `if [ ! -f /var/www/html/aws.zip ]; then
        cd /var/www/html
        mkdir vendor
        cd vendor
        wget https://docs.aws.amazon.com/aws-sdk-php/v3/download/aws.zip
        unzip aws.zip
      fi`,

      //# Update existing packages
      'dnf update -y'
    );

    //create security group for webServer
    const sgWebServer = new SecurityGroup(this, 'webServerSecurityGroup', {
      vpc,
      description: 'Web Server Security Group'
    });
    //allow 80 and 22 ports
    sgWebServer.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(80));
    sgWebServer.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(22));

    //create EC2 instance using t2.micro, x86_64 and AML2023
    //use public subnets with public IPs
    //use security group sgWebServer
    //use ec2UserDataWebServer
    //EC2 metadata must use V2 only
    const ec2WebServer = new Instance(this, 'webServer', {
      instanceName: 'WebServer Instance',
      requireImdsv2: true, //add instance metadata for token v2
      vpc,
      instanceType: new InstanceType('t2.micro'),
      machineImage: new AmazonLinuxImage({ generation: AmazonLinuxGeneration.AMAZON_LINUX_2023, cpuType: AmazonLinuxCpuType.X86_64 }),
      vpcSubnets: {
        subnetType: cdk.aws_ec2.SubnetType.PUBLIC
      },
      associatePublicIpAddress: true,
      securityGroup: sgWebServer,
      userData: ec2UserDataWebServer
    });


    //output the ec2 public IP and public DNS
    new cdk.CfnOutput(this, 'ec2PublicIp', {
      value: ec2WebServer.instancePublicIp,
      description: 'The public IP of the web server',
      exportName: 'ec2PublicIp'
    });
    new cdk.CfnOutput(this, 'ec2PublicDnsName', {
      value: ec2WebServer.instancePublicDnsName,
      description: 'The public DNS of the web server',
      exportName: 'ec2PublicDnsName'
    });


    //// Create AMI with ec2UserDataWebServer
    const webServerAmi = new AmazonLinuxImage({
      cpuType: AmazonLinuxCpuType.X86_64,
      generation: AmazonLinuxGeneration.AMAZON_LINUX_2023,
      userData: ec2UserDataWebServer
    });

    //create security group for ALB
    const sgALB = new SecurityGroup(this, 'albSecurityGroup', {
      vpc,
      description: 'ALB Security Group'
    });
    //allow 80 port
    sgALB.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(80));

    //create target group for ALB
    const webServerTargetGroup = new ApplicationTargetGroup(this, 'albTargetGroup', {
      port: 80,
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
      targetType: cdk.aws_elasticloadbalancingv2.TargetType.INSTANCE,
      vpc,
      protocolVersion: cdk.aws_elasticloadbalancingv2.ApplicationProtocolVersion.HTTP1,
      targetGroupName: 'web-TG'
    });

    //create ALB, internet faced
    const alb = new ApplicationLoadBalancer(this, 'alb', {
      vpc,
      internetFacing: true,
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC
      },
      securityGroup: sgALB,
    })

    //add listener to ALB to webServerTargetGroup
    alb.addListener('http', {
      port: 80,
      open: true,
      protocol: cdk.aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [webServerTargetGroup]
    })

    //create security group for ASG
    const sgASG = new SecurityGroup(this, 'asgSecurityGroup', {
      vpc,
      description: 'ASG Security Group'
    });
    //allow 80 port
    sgASG.addIngressRule(cdk.aws_ec2.Peer.securityGroupId(sgALB.securityGroupId), cdk.aws_ec2.Port.tcp(80));

    //create SSMInstanceProfile, an InstanceProfile for EC2 using managed policy for SSMManagedInstance
    const ssmInstanceProfile = new InstanceProfile(this, 'ssmInstanceProfile', {
      instanceProfileName: 'SSMInstanceProfile',
      role: new Role(this, 'ssmRole', {
        roleName: 'SSMRole',
        assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
        managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')]
      })
    });

    //create launch template for ASG using all elements above for webServer
    const webLaunchTemplate = new LaunchTemplate(this, 'launchTemplate', {
      launchTemplateName: 'web',
      machineImage: webServerAmi,
      instanceType: new InstanceType('t2.micro'),
      userData: ec2UserDataWebServer,
      securityGroup: sgASG,
      requireImdsv2: true,
      instanceProfile: ssmInstanceProfile
    });

    //create ASG, private subnets with egress, using webLaunchTemplate
    const asgWeb = new AutoScalingGroup(this, 'asg', {
      autoScalingGroupName: 'Web-ASG',
      vpc,
      minCapacity: 2,
      maxCapacity: 4,
      desiredCapacity: 2,
      launchTemplate: webLaunchTemplate,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS
      },
      //enable group metrics within cloudwatch
      groupMetrics: [GroupMetrics.all()],
    });
    //add ASG to webServerTargetGroup
    asgWeb.attachToApplicationTargetGroup(webServerTargetGroup);
    //scale on cpu utilization at 30% usage
    asgWeb.scaleOnCpuUtilization('web-asg-cpu', {
      targetUtilizationPercent: 30
    })
    //auto tag instances with Name=ASG-Web-Instance
    cdk.Tags.of(asgWeb).add('Name', 'ASG-Web-Instance')

    //output the ALB URL
    new cdk.CfnOutput(this, 'albUrl', {
      value: alb.loadBalancerDnsName,
      description: 'The URL of the load balancer',
      exportName: 'albUrl'
    });

  }
}
