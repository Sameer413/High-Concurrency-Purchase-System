import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
    ) { }

    async create(createUserDto: CreateUserDto): Promise<User> {
        const existing = await this.usersRepository.findOne({
            where: { email: createUserDto.email },
        });

        if (existing) {
            throw new ConflictException('A user with this email already exists');
        }

        const SALT_ROUNDS = 12;
        const hashedPassword = await bcrypt.hash(createUserDto.password, SALT_ROUNDS);

        const user = this.usersRepository.create({
            ...createUserDto,
            password: hashedPassword,
            roles: createUserDto.roles ?? [Role.USER],
        });

        return this.usersRepository.save(user);
    }

    async findAll(): Promise<User[]> {
        return this.usersRepository.find();
    }

    async findById(id: string): Promise<User> {
        const user = await this.usersRepository.findOne({ where: { id } });
        if (!user) throw new NotFoundException(`User with id "${id}" not found`);
        return user;
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.usersRepository.findOne({ where: { email } });
    }

    async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
        const user = await this.findById(id);

        if (updateUserDto.password) {
            updateUserDto.password = await bcrypt.hash(updateUserDto.password, 12);
        }

        Object.assign(user, updateUserDto);
        return this.usersRepository.save(user);
    }

    async updateRefreshToken(id: string, refreshToken: string | null): Promise<void> {
        const hashedRefreshToken = refreshToken
            ? await bcrypt.hash(refreshToken, 12)
            : null;

        await this.usersRepository.update(id, { hashedRefreshToken });
    }

    async remove(id: string): Promise<void> {
        const user = await this.findById(id);
        await this.usersRepository.remove(user);
    }

    async validateRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
        const user = await this.usersRepository.findOne({
            where: { id: userId },
            select: ['hashedRefreshToken'],
        });

        if (!user?.hashedRefreshToken) return false;
        return bcrypt.compare(refreshToken, user.hashedRefreshToken);
    }
}
