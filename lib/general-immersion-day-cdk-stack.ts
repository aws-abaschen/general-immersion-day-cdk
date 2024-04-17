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
    

    //create Gateway VpcEndpoint for s3 for private subnets with egress
    

    //then give full access to s3Endpoint to any principal
    

    //create userData for Linux EC2

    //create security group for webServer
    
    //then allow 80/tcp, 22/tcp, ports
    

    //create EC2 instance using t2.micro, x86_64 and AML2023
    //use public subnets with public IPs
    //use security group sgWebServer
    //use ec2UserDataWebServer
    //enforce imdsv2
    


    //output the ec2 public IP and public DNS


    // Create AMI with ec2UserDataWebServer
    

    //create security group for ALB
    
    //then allow 80 port

    //create target group for ALB
    

    //create ALB, internet faced
    

    //then add listener to ALB to webServerTargetGroup
    

    //create security group for ASG
    
    //then allow 80 port

    //create SSMInstanceProfile, an InstanceProfile for EC2 using managed policy for SSMManagedInstance
    

    //create launch template for ASG using all elements above for webServer
    

    //create ASG, private subnets with egress, using webLaunchTemplate, enable all group metrics
    
    //then add ASG to webServerTargetGroup
    
    //scale on cpu utilization at 30% usage
    
    //auto tag instances with Name=ASG-Web-Instance
    

    //output the ALB URL

  }
}
