import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, username, password } = req.body;

    const result = await authService.register({
      email: email.trim(),
      username: username.trim(),
      password,
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;

    const result = await authService.login({
      email: email.trim(),
      password,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await authService.getUserById(req.user!.userId);
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
}
