import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { connect, Connection, Channel, ConsumeMessage, Options } from 'amqplib';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private connection: Connection;
  private channel: Channel;
  private readonly retryAttempts = 5;
  private readonly retryDelay = 5000; // 5 seconds

  async onModuleInit() {
    await this.initializeRabbitMQ();
  }

  private async initializeRabbitMQ() {
    try {
      this.connection = await connect(
        process.env.RABBITMQ_URL || 'amqp://localhost',
      );
      this.channel = await this.connection.createChannel();

      this.connection.on('close', async () => {
        console.error('RabbitMQ connection closed, attempting reconnect...');
        await this.retryConnect();
      });

      console.log('RabbitMQ connected successfully.');
    } catch (error) {
      console.error('Error initializing RabbitMQ connection:', error);
      await this.retryConnect();
    }
  }

  private async retryConnect() {
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      console.log(`Reconnection attempt ${attempt}/${this.retryAttempts}...`);
      try {
        await this.initializeRabbitMQ();
        return;
      } catch {
        console.error(
          `Reconnection attempt ${attempt} failed, retrying in ${this.retryDelay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
      }
    }
    console.error(
      'Max reconnection attempts reached. RabbitMQ connection could not be re-established.',
    );
  }

  /**
   * Publishes a message to the specified queue with error handling and durable options.
   * @param queue - Queue name
   * @param message - The message object to send
   * @param options - Optional configurations like persistent message
   */
  async publishToQueue(
    queue: string,
    message: any,
    options: Options.Publish = { persistent: true },
  ) {
    try {
      if (!this.channel) throw new Error('Channel is not available');

      await this.channel.assertQueue(queue, { durable: true });
      this.channel.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(message)),
        options,
      );
      console.log(`Message published to queue ${queue}:`, message);
    } catch (error) {
      console.error('Error publishing to queue:', error);
    }
  }

  /**
   * Consumes messages from the specified queue with retry and DLX options.
   * @param queue - Queue name
   * @param callback - Callback function for message processing
   * @param dlx - Optional dead-letter exchange setup for handling failed messages
   */
  async consumeQueue(
    queue: string,
    callback: (msg: any) => void,
    dlx: string = 'deadLetterExchange',
  ) {
    try {
      if (!this.channel) throw new Error('Channel is not available');

      await this.channel.assertQueue(queue, {
        durable: true,
        deadLetterExchange: dlx,
      });
      await this.channel.consume(queue, async (msg: ConsumeMessage | null) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString());
            await callback(content);
            this.channel.ack(msg);
          } catch (processingError) {
            console.error(
              'Error processing message, requeueing:',
              processingError,
            );
            this.channel.nack(msg, false, true); // Requeue message
          }
        }
      });
    } catch (error) {
      console.error('Error consuming from queue:', error);
    }
  }

  async closeConnection() {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
      console.log('RabbitMQ connection closed successfully.');
    } catch (error) {
      console.error('Error closing RabbitMQ connection:', error);
    }
  }

  async onModuleDestroy() {
    await this.closeConnection();
  }
}
