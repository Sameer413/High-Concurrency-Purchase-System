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

    async updateProfile(id: string, updateData: Partial<CreateUserDto>): Promise<User> {
        const user = await this.findById(id);

        // Only allow updating specific fields for profile updates
        const allowedFields = ['firstName', 'lastName', 'phone'];
        const filteredData: any = {};
        
        for (const field of allowedFields) {
            if (updateData[field as keyof CreateUserDto] !== undefined) {
                filteredData[field] = updateData[field as keyof CreateUserDto];
            }
        }

        Object.assign(user, filteredData);
        return this.usersRepository.save(user);
    }

    async updatePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
        const user = await this.usersRepository.findOne({
            where: { id },
            select: ['id', 'password'],
        });

        if (!user) {
            throw new NotFoundException(`User with id "${id}" not found`);
        }

        // Verify current password
        const passwordMatches = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatches) {
            throw new ConflictException('Current password is incorrect');
        }

        // Hash and update new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await this.usersRepository.update(id, { password: hashedPassword });
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
            select: ['id', 'hashedRefreshToken'],
        });

        if (!user?.hashedRefreshToken) return false;
        return bcrypt.compare(refreshToken, user.hashedRefreshToken);
    }
}
