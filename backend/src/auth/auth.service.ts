import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthService {
  private prisma = new PrismaClient();
  private jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

  async signUp(email: string, password: string, name?: string) {
    try {
      // 检查用户是否已存在
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new Error('User already exists');
      }

      // 密码加密
      const hashedPassword = await bcrypt.hash(password, 12);

      // 创建用户
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name: name || null,
        },
      });

      return { user: { id: user.id, email: user.email, name: user.name } };
    } catch (error) {
      console.error('SignUp error:', error);
      return { error: 'Failed to create user' };
    }
  }

  async signIn(email: string, password: string) {
    try {
      // 查找用户
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user || !user.password) {
        throw new Error('User not found');
      }

      // 验证密码
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        throw new Error('Invalid password');
      }

      // 生成 JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        this.jwtSecret,
        { expiresIn: '7d' },
      );

      return {
        user: { id: user.id, email: user.email, name: user.name },
        token,
      };
    } catch (error) {
      console.error('SignIn error:', error);
      return { error: 'Failed to sign in' };
    }
  }

  async getSession(token: string) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        return null;
      }

      return {
        user: { id: user.id, email: user.email, name: user.name },
        session: { token, expiresAt: new Date(decoded.exp * 1000) },
      };
    } catch (error) {
      console.error('Session error:', error);
      return null;
    }
  }

  async signOut(token: string): Promise<boolean> {
    // 简单实现：JWT 无状态，客户端丢弃 token 即可
    // 在生产环境中，可以维护一个黑名单
    return true;
  }
}
